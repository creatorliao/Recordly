import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	app,
	BrowserWindow,
	desktopCapturer,
	webContents as electronWebContents,
	ipcMain,
	Menu,
	nativeImage,
	session,
	shell,
	systemPreferences,
	Tray,
} from "electron";
import { RECORDINGS_DIR } from "./appPaths";
import { readAppSetting, writeAppSetting } from "./appSettingsStore";
import {
	attachWebContentsConsoleLogging,
	endSessionLog,
	startSessionLog,
	writeSessionLog,
} from "./sessionLog";
import { showCursor } from "./cursorHider";
import { getGpuSwitches } from "./gpuSwitches";
import {
	cleanupAllExportStreams,
	cleanupNativeVideoExportSessions,
	getSelectedSourceId,
	killWindowsCaptureProcess,
	registerIpcHandlers,
} from "./ipc/handlers";
import { getAssetRootPath } from "./ipc/project/manager";
import { ensureMediaServer } from "./mediaServer";
import { hardenWebContentsNavigation, shouldHardenWebContentsType } from "./navigationPolicy";
import { shouldGrantDisplayCapture, shouldGrantMediaPermission } from "./permissionPolicy";
import { ensurePackagedRendererServer, getPackagedRendererBaseUrl } from "./rendererServer";
import {
	createEditorWindow,
	createHudOverlayWindow,
	createSourceSelectorWindow,
	getHudOverlayWindow,
	isHudOverlayMousePassthroughSupported,
	reassertHudOverlayCaptureProtection,
	reassertHudOverlayMousePassthrough as reassertHudOverlayMouseState,
	setHudOverlayRecordingActive,
} from "./windows";

const electronMainDir = path.dirname(fileURLToPath(import.meta.url));
const IS_SMOKE_EXPORT = process.env.RECORDLY_SMOKE_EXPORT === "1";

function ignoreBrokenConsolePipe(stream: NodeJS.WritableStream | undefined) {
	stream?.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code === "EPIPE" || error.code === "EIO") {
			return;
		}
		throw error;
	});
}

ignoreBrokenConsolePipe(process.stdout);
ignoreBrokenConsolePipe(process.stderr);

app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("enable-gpu-rasterization");

app.on("web-contents-created", (_event, contents) => {
	attachWebContentsConsoleLogging(contents);
	if (!shouldHardenWebContentsType(contents.getType())) {
		return;
	}

	hardenWebContentsNavigation(contents, (url) => shell.openExternal(url));
});

function configureGpuAccelerationSwitches() {
	const { useAngle, useGl, disableFeatures } = getGpuSwitches(process.platform, process.env);
	if (useAngle) {
		app.commandLine.appendSwitch("use-angle", useAngle);
	}
	if (useGl) {
		app.commandLine.appendSwitch("use-gl", useGl);
	}
	if (disableFeatures && disableFeatures.length > 0) {
		app.commandLine.appendSwitch("disable-features", disableFeatures.join(","));
	}
}

async function logSmokeExportGpuDiagnostics() {
	if (!IS_SMOKE_EXPORT) {
		return;
	}

	try {
		console.log("[smoke-export] GPU feature status", JSON.stringify(app.getGPUFeatureStatus()));
		console.log("[smoke-export] GPU info", JSON.stringify(await app.getGPUInfo("basic")));
	} catch (error) {
		console.warn("[smoke-export] Failed to read GPU diagnostics:", error);
	}
}

configureGpuAccelerationSwitches();

async function ensureRecordingsDir() {
	try {
		await fs.mkdir(RECORDINGS_DIR, { recursive: true });
		console.log("RECORDINGS_DIR:", RECORDINGS_DIR);
		console.log("User Data Path:", app.getPath("userData"));
	} catch (error) {
		console.error("Failed to create recordings directory:", error);
		writeSessionLog({
			level: "error",
			scope: "app",
			event: "app.recordings-dir-failed",
			msg: String(error),
		});
	}
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(electronMainDir, "..");

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
const IS_DEV = Boolean(VITE_DEV_SERVER_URL);

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

function getTrustedCaptureDocumentBaseUrls(): string[] {
	const trustedUrls = [pathToFileURL(path.join(RENDERER_DIST, "index.html")).href];

	if (VITE_DEV_SERVER_URL) {
		trustedUrls.push(VITE_DEV_SERVER_URL);
	}

	const packagedRendererBaseUrl = getPackagedRendererBaseUrl();
	if (packagedRendererBaseUrl) {
		trustedUrls.push(new URL("/", packagedRendererBaseUrl).href);
	}

	return trustedUrls;
}

function isHudWebContents(webContents: Electron.WebContents | null): boolean {
	if (!webContents || webContents.isDestroyed()) {
		return false;
	}

	const hudWindow = getHudOverlayWindow();
	return Boolean(hudWindow && hudWindow.webContents === webContents);
}

// Window references
let mainWindow: BrowserWindow | null = null;
let sourceSelectorWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayContextMenu: Menu | null = null;
let selectedSourceName = "";
let editorHasUnsavedChanges = false;
let isForceClosing = false;
let isAppQuitting = false;
let isCreatingMainWindow = false;
let isCreatingEditorWindow = false;
const shouldEnforceSingleInstanceLock = !IS_DEV;
const hasSingleInstanceLock = shouldEnforceSingleInstanceLock
	? app.requestSingleInstanceLock()
	: true;

if (!hasSingleInstanceLock) {
	app.quit();
}

function closeEditorWindowBypassingUnsavedPrompt(window: BrowserWindow | null) {
	if (!window || window.isDestroyed()) {
		return;
	}

	if (isEditorWindow(window)) {
		isForceClosing = true;
		editorHasUnsavedChanges = false;
	}
	window.close();
}

function closeEditorWindowToHud(window: BrowserWindow | null) {
	if (!window || window.isDestroyed()) {
		return;
	}

	// The HUD renderer normally remains hidden while the editor is open so
	// recording finalization can continue. Restore that HUD before destroying
	// the editor, keeping Recordly in its ready-to-record state on the taskbar.
	window.hide();
	if (mainWindow === window) {
		mainWindow = null;
	}
	createWindow();
	closeEditorWindowBypassingUnsavedPrompt(window);
}

// 设置「关闭窗口时」：默认退出应用；可选最小化到托盘。
function shouldMinimizeToTrayOnClose() {
	return readAppSetting("closeWindowBehavior") === "tray";
}

function hideWindowToTray(window: BrowserWindow | null) {
	if (!window || window.isDestroyed()) {
		return;
	}

	window.hide();
	// 首次缩到托盘给气泡说明，只提醒一次。
	if (!readAppSetting("hasShownTrayHint") && tray && process.platform === "win32") {
		try {
			tray.displayBalloon({
				title: "Recordly",
				content: "已放到托盘。要退出请点托盘图标 → 退出。",
			});
		} catch {
			// displayBalloon 在部分 Windows 版本不可用，忽略即可。
		}
		writeAppSetting("hasShownTrayHint", true);
	}
}

function restoreWindowSafely(window: BrowserWindow | null) {
	if (!window || window.isDestroyed()) {
		return;
	}

	if (!isEditorWindow(window) && process.platform === "win32") {
		showHudOverlayFromTray();
		return;
	}

	if (window.isMinimized()) {
		window.restore();
	}

	if (!window.isVisible()) {
		window.show();
	}

	window.moveTop();
	window.focus();
}

function getExistingEditorWindow(): BrowserWindow | null {
	return (
		BrowserWindow.getAllWindows().find(
			(window) => !window.isDestroyed() && isEditorWindow(window),
		) ?? null
	);
}

// Tray Icons (lazily created after app is ready to avoid accessing Electron APIs too early)
let defaultTrayIcon: ReturnType<typeof getTrayIcon> | null = null;
let recordingTrayIcon: ReturnType<typeof getTrayIcon> | null = null;

function getPlatformAppIconFilename(size: 32 | 128 | 512) {
	const baseName = process.platform === "darwin" ? "recordlymac" : "recordly";
	return `app-icons/${baseName}-${size}.png`;
}

function getDefaultTrayIcon() {
	if (!defaultTrayIcon) {
		defaultTrayIcon = getTrayIcon(getPlatformAppIconFilename(32));
	}
	return defaultTrayIcon;
}

function getRecordingTrayIcon() {
	if (!recordingTrayIcon) {
		recordingTrayIcon = getTrayIcon("rec-button.png");
	}
	return recordingTrayIcon;
}

function showHudOverlayFromTray() {
	const hud = getHudOverlayWindow();
	if (!hud) {
		return false;
	}

	if (hud.isMinimized()) {
		hud.restore();
	}

	if (process.platform === "win32" && isHudOverlayMousePassthroughSupported()) {
		hud.showInactive();
		hud.moveTop();
		reassertHudOverlayMouseState();
		return true;
	}

	hud.show();
	hud.moveTop();
	hud.focus();
	return true;
}

ipcMain.on("set-has-unsaved-changes", (_event, hasChanges: boolean) => {
	editorHasUnsavedChanges = hasChanges;
});

function createWindow() {
	if (!app.isReady()) {
		void app.whenReady().then(() => {
			if (!mainWindow || mainWindow.isDestroyed()) {
				createWindow();
			}
		});
		return;
	}

	if (isCreatingMainWindow) {
		return;
	}

	if (mainWindow && !mainWindow.isDestroyed()) {
		restoreWindowSafely(mainWindow);
		return;
	}

	const existingHudWindow = getHudOverlayWindow();
	if (existingHudWindow) {
		mainWindow = existingHudWindow;
		restoreWindowSafely(existingHudWindow);
		return;
	}

	isCreatingMainWindow = true;
	const createdHudWindow = createHudOverlayWindow();
	mainWindow = createdHudWindow;
	createdHudWindow.once("closed", () => {
		if (mainWindow === createdHudWindow) {
			mainWindow = null;
		}
	});
	isCreatingMainWindow = false;
}

function focusOrCreateMainWindow() {
	if (!app.isReady()) {
		void app.whenReady().then(() => {
			focusOrCreateMainWindow();
		});
		return;
	}

	if (!mainWindow || mainWindow.isDestroyed()) {
		const existingHud = getHudOverlayWindow();
		if (existingHud && !existingHud.isDestroyed()) {
			mainWindow = existingHud;
		} else {
			createWindow();
			return;
		}
	}

	if (mainWindow && !mainWindow.isDestroyed()) {
		// On Linux/Wayland, focus() often doesn't take effect (compositor ignores it). Apps like Telegram
		// work because they receive an XDG activation token via StatusNotifierItem.ProvideXdgActivationToken;
		// Electron's tray doesn't handle that yet. Workaround: destroy and recreate the HUD so the new
		// window gets focus (creation path works). Only for HUD, not editor.
		if (
			process.platform === "linux" &&
			!mainWindow.isFocused() &&
			!isEditorWindow(mainWindow)
		) {
			const win = mainWindow;
			mainWindow = null;
			win.once("closed", () => createWindow());
			win.destroy();
			return;
		}

		// On Win32 with mouse passthrough enabled (Win11+), calling
		// show/moveTop/focus on the transparent HUD overlay permanently corrupts
		// setIgnoreMouseEvents forwarding, making it click-through.  Only focus
		// the editor window; the HUD is alwaysOnTop so it doesn't need explicit
		// focus.  On Win10 (passthrough disabled), the HUD is always interactive
		// and can be safely shown/restored.
		if (
			process.platform === "win32" &&
			!isEditorWindow(mainWindow) &&
			isHudOverlayMousePassthroughSupported()
		) {
			showHudOverlayFromTray();
			return;
		}

		mainWindow.show();
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.moveTop();
		mainWindow.focus();
	}
}

function isEditorWindow(window: BrowserWindow) {
	return window.webContents.getURL().includes("windowType=editor");
}

function sendEditorMenuAction(
	channel: "menu-load-project" | "menu-save-project" | "menu-save-project-as",
) {
	let targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;

	if (!targetWindow || targetWindow.isDestroyed() || !isEditorWindow(targetWindow)) {
		createEditorWindowWrapper();
		targetWindow = mainWindow;
		if (!targetWindow || targetWindow.isDestroyed()) return;

		targetWindow.webContents.once("did-finish-load", () => {
			if (!targetWindow || targetWindow.isDestroyed()) return;
			targetWindow.webContents.send(channel);
		});
		return;
	}

	targetWindow.webContents.send(channel);
}

function setupApplicationMenu() {
	const isMac = process.platform === "darwin";
	const template: Electron.MenuItemConstructorOptions[] = [];
	if (isMac) {
		template.push({
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		});
	}

	template.push(
		{
			label: "文件",
			submenu: [
				{
					label: "打开项目…",
					accelerator: "CmdOrCtrl+O",
					click: () => sendEditorMenuAction("menu-load-project"),
				},
				{
					label: "保存项目…",
					accelerator: "CmdOrCtrl+S",
					click: () => sendEditorMenuAction("menu-save-project"),
				},
				{
					label: "项目另存为…",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendEditorMenuAction("menu-save-project-as"),
				},
				...(isMac
					? []
					: [
							{ type: "separator" as const },
							{ role: "quit" as const, label: "退出", accelerator: "CmdOrCtrl+Q" },
						]),
			],
		},
		{
			label: "编辑",
			submenu: [
				{ role: "undo", label: "撤销" },
				{ role: "redo", label: "重做" },
				{ type: "separator" },
				{ role: "cut", label: "剪切" },
				{ role: "copy", label: "复制" },
				{ role: "paste", label: "粘贴" },
				{ role: "selectAll", label: "全选" },
			],
		},
		{
			label: "查看",
			submenu: [
				{ role: "reload", label: "重新加载" },
				{ role: "forceReload", label: "强制重新加载" },
				{ role: "toggleDevTools", label: "开发者工具" },
				{ type: "separator" },
				{ role: "resetZoom", label: "重置缩放" },
				{ role: "zoomIn", label: "放大" },
				{ role: "zoomOut", label: "缩小" },
				{ type: "separator" },
				{ role: "togglefullscreen", label: "全屏" },
			],
		},
		{
			label: "窗口",
			submenu: isMac
				? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
				: [
						{ role: "minimize", label: "最小化" },
						{ role: "close", label: "关闭" },
					],
		},
	);

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function isPrimaryTrayClick(event: unknown) {
	const button =
		event && typeof event === "object" && "button" in event
			? (event as { button?: number | string }).button
			: undefined;
	return button === undefined || button === 0 || button === "left";
}

function createTray() {
	tray = new Tray(getDefaultTrayIcon());
	tray.on("click", (event) => {
		if (process.platform === "win32" && !isPrimaryTrayClick(event)) {
			return;
		}

		focusOrCreateMainWindow();
	});

	if (process.platform === "win32") {
		tray.on("right-click", () => {
			if (!tray || !trayContextMenu) {
				return;
			}

			tray.popUpContextMenu(trayContextMenu);
		});
		return;
	}

	tray.on("double-click", () => focusOrCreateMainWindow());
}

function shouldUseTray() {
	// Windows 打开 Tray 能力（可选「最小化到托盘」）；Linux 仍以托盘为主入口。
	// macOS 走 Dock，不建托盘。
	return process.platform === "linux" || process.platform === "win32";
}

function getPublicAssetPath(filename: string) {
	return path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename);
}

function getAppImage(filename: string) {
	return nativeImage.createFromPath(getPublicAssetPath(filename));
}

function getTrayIcon(filename: string) {
	return getAppImage(filename).resize({
		width: 24,
		height: 24,
		quality: "best",
	});
}

function syncDockIcon() {
	if (process.platform !== "darwin" || !app.dock) {
		return;
	}

	const dockIcon = getAppImage(getPlatformAppIconFilename(512));
	if (!dockIcon.isEmpty()) {
		app.dock.setIcon(dockIcon);
	}
}

function updateTrayMenu(recording: boolean = false) {
	if (!tray) return;
	const trayIcon = recording ? getRecordingTrayIcon() : getDefaultTrayIcon();
	const trayToolTip = recording ? `Recording: ${selectedSourceName}` : "Recordly";
	const menuTemplate = recording
		? [
				{
					label: "显示控制条",
					click: () => {
						if (!showHudOverlayFromTray()) {
							focusOrCreateMainWindow();
						}
					},
				},
				{
					label: "停止录制",
					click: () => {
						if (mainWindow && !mainWindow.isDestroyed()) {
							mainWindow.webContents.send("stop-recording-from-tray");
						}
					},
				},
				{
					label: "退出",
					click: () => {
						app.quit();
					},
				},
			]
		: [
				{
					label: "打开录制工具栏",
					click: () => {
						if (!showHudOverlayFromTray()) {
							focusOrCreateMainWindow();
						}
					},
				},
				{
					label: "打开编辑器",
					click: () => {
						createEditorWindowWrapper();
					},
				},
				{
					label: "退出",
					click: () => {
						app.quit();
					},
				},
			];
	const menu = Menu.buildFromTemplate(menuTemplate);
	trayContextMenu = menu;
	tray.setImage(trayIcon);
	tray.setToolTip(trayToolTip);
	if (process.platform !== "win32") {
		tray.setContextMenu(menu);
	}
}

function createEditorWindowWrapper() {
	const existingEditorWindow = getExistingEditorWindow();
	if (existingEditorWindow) {
		mainWindow = existingEditorWindow;
		restoreWindowSafely(existingEditorWindow);
		return existingEditorWindow;
	}

	if (isCreatingEditorWindow) {
		const currentWindow = mainWindow;
		if (currentWindow && !currentWindow.isDestroyed()) {
			return currentWindow;
		}

		const currentEditorWindow = getExistingEditorWindow();
		if (currentEditorWindow) {
			mainWindow = currentEditorWindow;
			return currentEditorWindow;
		}
	}

	isCreatingEditorWindow = true;
	const previousWindow = mainWindow;
	if (previousWindow && !previousWindow.isDestroyed()) {
		const closingEditorWindow = isEditorWindow(previousWindow);

		if (closingEditorWindow) {
			closeEditorWindowBypassingUnsavedPrompt(previousWindow);
		} else {
			// It's the HUD or another window. Hide it instead of closing so background
			// tasks (like webcam finalizing) can finish in its renderer process.
			previousWindow.hide();
		}

		if (!closingEditorWindow) {
			isForceClosing = false;
		}
		if (mainWindow === previousWindow) {
			mainWindow = null;
		}
	}
	const editorWindow = createEditorWindow();
	mainWindow = editorWindow;
	editorHasUnsavedChanges = false;

	editorWindow.on("closed", () => {
		if (mainWindow === editorWindow) {
			mainWindow = null;
		}
		isCreatingEditorWindow = false;
		isForceClosing = false;
		editorHasUnsavedChanges = false;
	});

	editorWindow.on("close", (event) => {
		// 真正退出 / 强制关闭（app.quit、before-quit 已置位）时放行。
		if (isForceClosing || isAppQuitting) {
			return;
		}

		event.preventDefault();

		const proceedClose = () => {
			const minimizeToTray = shouldMinimizeToTrayOnClose();
			writeSessionLog({
				level: "info",
				scope: "window",
				event: minimizeToTray ? "editor.close-to-tray" : "editor.close-quit",
				msg: minimizeToTray
					? "closing editor window to tray"
					: "closing editor window, quitting app",
			});
			if (minimizeToTray) {
				// 可选：X 缩到托盘，不重建 HUD；Tray 仍能进任一面或退出。
				hideWindowToTray(editorWindow);
			} else {
				// 默认：X 退出整个应用（剪映/OBS 同类），不复活 HUD。
				app.quit();
			}
		};

		if (!editorHasUnsavedChanges) {
			proceedClose();
			return;
		}

		// 不弹系统原生框：交给渲染进程用和「返回录制」同一套未保存对话框。
		editorWindow.webContents.send("request-save-before-close");
		ipcMain.once("save-before-close-done", (_event, proceed: boolean) => {
			if (!proceed) {
				isAppQuitting = false;
				return;
			}
			proceedClose();
		});
	});

	return editorWindow;
}

/**
 * Leaves the editor and brings the recording UI (HUD overlay) back.
 * Reuses closeEditorWindowToHud: it hides the editor, restores the HUD window,
 * and closes the editor window without firing the native unsaved-changes prompt.
 * The renderer confirms unsaved changes before invoking this.
 */
function returnToRecording() {
	const editorWindow = getExistingEditorWindow();
	if (editorWindow && !editorWindow.isDestroyed()) {
		closeEditorWindowToHud(editorWindow);
		return;
	}
	createWindow();
}

ipcMain.handle("switch-to-recording", () => {
	console.log("[switch-to-recording] Returning to the recording UI");
	returnToRecording();
});

function createSourceSelectorWindowWrapper() {
	sourceSelectorWindow = createSourceSelectorWindow();
	sourceSelectorWindow.on("closed", () => {
		sourceSelectorWindow = null;
	});
	return sourceSelectorWindow;
}

// On macOS, applications and their menu bar stay active until the user quits
// explicitly with Cmd + Q.
app.on("before-quit", () => {
	isAppQuitting = true;
	killWindowsCaptureProcess();
	showCursor();
	cleanupNativeVideoExportSessions();
	void cleanupAllExportStreams();
	endSessionLog("before-quit");
});

app.on("window-all-closed", () => {
	if (IS_SMOKE_EXPORT || process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	focusOrCreateMainWindow();
});

app.on("second-instance", () => {
	focusOrCreateMainWindow();
});

// Register all IPC handlers when app is ready
app.whenReady().then(async () => {
	try {
		await startSessionLog();
	} catch (error) {
		console.error("Failed to start session log:", error);
	}

	if (process.platform === "win32") {
		app.setAppUserModelId("dev.recordly.app");
	}

	session.defaultSession.setPermissionCheckHandler(
		(webContents, permission, requestingOrigin, details) => {
			return shouldGrantMediaPermission(
				{
					permission,
					isTrustedCaptureWindow: isHudWebContents(webContents),
					isMainFrame: details.isMainFrame,
					currentDocumentUrl: webContents?.getURL() ?? "",
					// Electron 39 may supply the last committed document URL, including its
					// query, in the requestingOrigin argument for media checks.
					requestingUrl: details.requestingUrl ?? requestingOrigin,
					securityOrigins:
						details.securityOrigin === undefined ? [] : [details.securityOrigin],
				},
				getTrustedCaptureDocumentBaseUrls(),
			);
		},
	);

	session.defaultSession.setPermissionRequestHandler(
		(webContents, permission, callback, details) => {
			const securityOrigin = "securityOrigin" in details ? details.securityOrigin : undefined;

			callback(
				shouldGrantMediaPermission(
					{
						permission,
						isTrustedCaptureWindow: isHudWebContents(webContents),
						isMainFrame: details.isMainFrame,
						currentDocumentUrl: webContents.getURL(),
						requestingUrl: details.requestingUrl,
						securityOrigins: securityOrigin === undefined ? [] : [securityOrigin],
					},
					getTrustedCaptureDocumentBaseUrls(),
				),
			);
		},
	);

	// Recordly does not use WebHID, Web Serial, or WebUSB. Do not grant devices by default.
	session.defaultSession.setDevicePermissionHandler(() => false);

	// macOS prompts for camera and microphone access at the point of use. Asking
	// here blocks the first window behind two modal OS permission flows and makes
	// a fresh install look hung. Windows has no equivalent request API, so retain
	// its diagnostic warnings.
	if (process.platform === "win32") {
		const cameraStatus = systemPreferences.getMediaAccessStatus("camera");
		const micStatus = systemPreferences.getMediaAccessStatus("microphone");
		if (cameraStatus !== "granted") {
			console.warn(
				`[permissions] Camera access is "${cameraStatus}" — webcam may not work. Check Windows Settings > Privacy > Camera.`,
			);
		}
		if (micStatus !== "granted") {
			console.warn(
				`[permissions] Microphone access is "${micStatus}" — mic recording may not work. Check Windows Settings > Privacy > Microphone.`,
			);
		}
	}

	ipcMain.on("hud-overlay-close", () => {
		const hud = getHudOverlayWindow();
		if (!hud) {
			return;
		}

		// 可选「最小化到托盘」：HUD 的 X 缩到托盘，不退出。
		if (shouldMinimizeToTrayOnClose()) {
			console.log("[main] Hiding HUD window to tray via hud-overlay-close");
			hideWindowToTray(hud);
			return;
		}

		console.log("[main] Closing HUD window via hud-overlay-close");
		hud.close();

		// If this was the last window (or we are in a state where we should quit), do it.
		// We use a small delay to allow window.close() to propagate.
		setTimeout(() => {
			const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
			if (windows.length === 0) {
				console.log("[main] No windows left, quitting app");
				app.quit();
			}
		}, 100);
	});
	if (process.platform === "darwin" && app.dock) {
		await app.dock.show();
	}
	syncDockIcon();
	if (shouldUseTray()) {
		createTray();
		updateTrayMenu();
	}
	setupApplicationMenu();
	await Promise.all([
		ensureRecordingsDir(),
		!VITE_DEV_SERVER_URL
			? ensurePackagedRendererServer(RENDERER_DIST, () => ({
					wallpapers: path.join(getAssetRootPath(), "wallpapers"),
				})).catch((error) => {
					console.warn(
						"[renderer-server] Failed to start packaged renderer server:",
						error,
					);
				})
			: Promise.resolve(),
		ensureMediaServer().catch((error) => {
			console.warn("[media-server] Failed to start media server:", error);
		}),
	]);

	registerIpcHandlers(
		createEditorWindowWrapper,
		createSourceSelectorWindowWrapper,
		() => mainWindow,
		() => sourceSelectorWindow,
		(recording: boolean, sourceName: string) => {
			selectedSourceName = sourceName;
			setHudOverlayRecordingActive(recording);
			if (shouldUseTray()) {
				if (!tray) createTray();
				updateTrayMenu(recording);
			}
			if (recording) {
				reassertHudOverlayMouseState();
			}
			if (!recording) {
				restoreWindowSafely(mainWindow);
			}
		},
	);

	if (IS_SMOKE_EXPORT || process.env.RECORDLY_DEV_OPEN_RECORDING_INPUT) {
		await logSmokeExportGpuDiagnostics();
		if (IS_SMOKE_EXPORT) {
			const smokeSource =
				process.env.RECORDLY_SMOKE_EXPORT_PROJECT ??
				process.env.RECORDLY_SMOKE_EXPORT_INPUT ??
				"<missing input>";
			console.log(`[smoke-export] Starting editor smoke export for ${smokeSource}`);
		} else {
			console.log(
				`[dev-open-recording] Starting editor for ${process.env.RECORDLY_DEV_OPEN_RECORDING_INPUT}`,
			);
		}
		createEditorWindowWrapper();
		return;
	}

	createWindow();

	// Register the display media handler so that renderer's getDisplayMedia()
	// calls land on the pre-selected source without showing a system picker.
	//
	// IMPORTANT: The callback must receive a plain { id, name } Video object.
	// Passing the full DesktopCapturerSource (with thumbnail, appIcon, etc.)
	// via an unsafe cast breaks Electron's internal cursor-constraint
	// propagation and causes cursor: 'never' from the renderer to be silently
	// ignored by the native capture pipeline.
	session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
		try {
			const frame = request.frame;
			const isLiveFrame = Boolean(frame && !frame.isDestroyed());
			const requestingWebContents =
				isLiveFrame && frame ? electronWebContents.fromFrame(frame) : undefined;
			const isHudMainFrame = Boolean(
				isLiveFrame &&
					requestingWebContents &&
					isHudWebContents(requestingWebContents) &&
					frame === requestingWebContents.mainFrame,
			);

			if (
				!shouldGrantDisplayCapture(
					{
						isTrustedCaptureWindow: isHudMainFrame,
						isMainFrame: Boolean(isLiveFrame && frame?.parent === null),
						currentDocumentUrl: isLiveFrame ? (frame?.url ?? "") : "",
						securityOrigin: request.securityOrigin,
						videoRequested: request.videoRequested,
					},
					getTrustedCaptureDocumentBaseUrls(),
				)
			) {
				callback({});
				return;
			}

			// Browser and Linux portal capture starts as soon as this callback
			// resolves, before recording-state-changed is emitted.
			reassertHudOverlayCaptureProtection();

			const sourceId = getSelectedSourceId();
			// On Linux/Wayland, calling desktopCapturer.getSources() itself
			// invokes the xdg-desktop-portal picker. If we then return one of
			// those sources, Chromium triggers a SECOND portal because the
			// pre-enumerated source IDs are stale on Wayland. To collapse this
			// into a single portal invocation, when the Linux portal sentinel
			// is set we skip getSources entirely and hand back a synthetic
			// source id; Chromium then opens the portal once to actually
			// resolve the capture.
			// Default to the sentinel on Linux when no source has been
			// pre-selected (e.g. fresh session where the renderer skipped the
			// source picker entirely). This avoids calling getSources() which
			// would itself trigger an extra portal dialog.
			const isLinuxPortalSentinel =
				process.platform === "linux" && (sourceId === "screen:linux-portal" || !sourceId);
			if (isLinuxPortalSentinel) {
				callback({ video: { id: "screen:0:0", name: "Entire screen" } });
				return;
			}
			const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
			const source = sourceId
				? (sources.find((s) => s.id === sourceId) ?? sources[0])
				: sources[0];
			if (source) {
				callback({
					video: { id: source.id, name: source.name },
				});
			} else {
				callback({});
			}
		} catch (error) {
			console.error("setDisplayMediaRequestHandler error:", error);
			callback({});
		}
	});
});
