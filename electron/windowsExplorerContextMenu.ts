import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readAppSetting, writeAppSetting } from "./appSettingsStore";
import { getUiLocale } from "./uiLocale";

const execFileAsync = promisify(execFile);

const CONTEXT_MENU_SETTING_KEY = "explorerContextMenuEnabled";

const LABELS = {
	"zh-CN": {
		root: "Recordly",
		record: "开始录制",
		hud: "打开录制工具栏",
		open: "用 Recordly 打开",
	},
	en: {
		root: "Recordly",
		record: "Start recording",
		hud: "Open recording toolbar",
		open: "Open with Recordly",
	},
} as const;

// 三个右键落点：文件(*)、文件夹(directory)、文件夹空白处(directory\background)。
// 文件用 %1，文件夹用 %V。
const ROOT_DEFINITIONS = [
	{ key: "Software\\Classes\\*\\shell\\Recordly", pathVar: "%1" },
	{ key: "Software\\Classes\\directory\\shell\\Recordly", pathVar: "%V" },
	{
		key: "Software\\Classes\\directory\\background\\shell\\Recordly",
		pathVar: "%V",
	},
];

const VERBS = [
	{ id: "record", command: "--record --path {pathVar}" },
	{ id: "hud", command: "--hud --path {pathVar}" },
	{ id: "open", command: "--open {pathVar}" },
];

function getLabels() {
	return getUiLocale() === "en" ? LABELS.en : LABELS["zh-CN"];
}

function getExePath() {
	return process.execPath;
}

async function runReg(args: string[]) {
	try {
		await execFileAsync("reg.exe", args, { windowsHide: true });
	} catch (error) {
		console.warn("[context-menu] reg.exe failed", args.join(" "), error);
	}
}

async function writeRoot(root: (typeof ROOT_DEFINITIONS)[number], labels: ReturnType<typeof getLabels>) {
	const exe = getExePath();
	const rootPath = `HKCU\\${root.key}`;
	await runReg(["add", rootPath, "/ve", "/d", labels.root, "/f"]);
	await runReg(["add", rootPath, "/v", "Icon", "/t", "REG_SZ", "/d", `"${exe}"`, "/f"]);
	// 空 SubCommands + 同键 shell 子命令 = Windows 经典级联（7-Zip 同类）。
	await runReg(["add", rootPath, "/v", "SubCommands", "/t", "REG_SZ", "/d", "", "/f"]);

	for (const verb of VERBS) {
		const verbLabel = labels[verb.id as keyof typeof labels];
		const verbPath = `${rootPath}\\shell\\${verb.id}`;
		await runReg(["add", verbPath, "/ve", "/d", verbLabel, "/f"]);
		await runReg(["add", verbPath, "/v", "Icon", "/t", "REG_SZ", "/d", `"${exe}"`, "/f"]);
		const command = `"${exe}" ${verb.command.replace("{pathVar}", root.pathVar)}`;
		await runReg(["add", `${verbPath}\\command`, "/ve", "/d", command, "/f"]);
	}
}

export async function writeExplorerContextMenu() {
	if (process.platform !== "win32") return;
	const labels = getLabels();
	for (const root of ROOT_DEFINITIONS) {
		await writeRoot(root, labels);
	}
}

export async function removeExplorerContextMenu() {
	if (process.platform !== "win32") return;
	for (const root of ROOT_DEFINITIONS) {
		await runReg(["delete", `HKCU\\${root.key}`, "/f"]);
	}
}

export function isExplorerContextMenuEnabled(): boolean {
	return readAppSetting(CONTEXT_MENU_SETTING_KEY) !== false;
}

/** 把当前设置同步到注册表：默认开，首次 whenReady 写入。 */
export async function syncExplorerContextMenu() {
	if (isExplorerContextMenuEnabled()) {
		await writeExplorerContextMenu();
	} else {
		await removeExplorerContextMenu();
	}
}

/** 设置开关：保存偏好并即时写/删注册表。 */
export async function setExplorerContextMenuEnabled(enabled: boolean) {
	writeAppSetting(CONTEXT_MENU_SETTING_KEY, enabled);
	if (enabled) {
		await writeExplorerContextMenu();
	} else {
		await removeExplorerContextMenu();
	}
}

export { CONTEXT_MENU_SETTING_KEY };
