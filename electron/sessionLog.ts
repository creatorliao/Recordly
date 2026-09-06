/**
 * 按次启动的会话日志：一份 JSONL，主进程为真源。
 * 写盘失败不得打断录制/导出。
 */
import { randomUUID } from "node:crypto";
import type { WriteStream } from "node:fs";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import {
	formatSessionLogFileName,
	formatSessionLogLine,
	listSessionLogsToPrune,
	parseRendererSessionLogPayload,
	type RendererSessionLogPayload,
	SESSION_LOG_KEEP_COUNT,
	SESSION_LOG_MAX_BYTES,
	SESSION_LOG_MAX_LINES,
	sessionLogErrorFields,
	type SessionLogCorrelation,
	type SessionLogInput,
	type SessionLogLevel,
	shouldWriteSessionLogLevel,
} from "./sessionLogFormat";

export type SessionLogPhase =
	| "idle"
	| "recording"
	| "mux"
	| "editor"
	| "export"
	| "captions";

type SessionLogState = {
	sessionId: string;
	logsDir: string;
	logPath: string;
	stream: WriteStream | null;
	bytes: number;
	lines: number;
	truncated: boolean;
	debugEnabled: boolean;
	corr: SessionLogCorrelation;
	phase: SessionLogPhase;
	consoleHooked: boolean;
	resourceTimer: ReturnType<typeof setInterval> | null;
	writingGuard: boolean;
	childProcesses: Map<number, string>;
	captureContext: {
		backend?: string;
		width?: number;
		height?: number;
		fps?: number;
		bitrateBps?: number | null;
		preset?: string;
	} | null;
	originalConsole: {
		log: typeof console.log;
		warn: typeof console.warn;
		error: typeof console.error;
	};
};

let state: SessionLogState | null = null;

function debugEnabledFromEnv() {
	return process.env.RECORDLY_LOG_DEBUG === "1";
}

function stringifyConsoleArgs(args: unknown[]) {
	return args
		.map((arg) => {
			if (typeof arg === "string") {
				return arg;
			}
			if (arg instanceof Error) {
				return `${arg.name}: ${arg.message}`;
			}
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(" ");
}

async function pruneOldSessionLogs(logsDir: string) {
	try {
		const names = await fs.readdir(logsDir);
		const stale = listSessionLogsToPrune(names, SESSION_LOG_KEEP_COUNT);
		await Promise.all(
			stale.map((name) => fs.rm(path.join(logsDir, name), { force: true }).catch(() => undefined)),
		);
	} catch {
		// 清理失败不影响本次启动写日志
	}
}

function writeRaw(input: Omit<SessionLogInput, "sessionId">) {
	const current = state;
	if (!current?.stream || current.truncated) {
		return;
	}
	if (!shouldWriteSessionLogLevel(input.level, current.debugEnabled)) {
		return;
	}
	if (current.bytes >= SESSION_LOG_MAX_BYTES || current.lines >= SESSION_LOG_MAX_LINES) {
		if (!current.truncated) {
			current.truncated = true;
			const cap = formatSessionLogLine({
				level: "warn",
				scope: "app",
				event: "log.truncated",
				sessionId: current.sessionId,
				msg: "session log reached size or line cap",
				data: { bytes: current.bytes, lines: current.lines },
			});
			current.stream.write(cap);
		}
		return;
	}

	const line = formatSessionLogLine({
		...input,
		sessionId: current.sessionId,
		corr: {
			...current.corr,
			...input.corr,
		},
	});
	current.bytes += Buffer.byteLength(line);
	current.lines += 1;
	current.stream.write(line);
}

/** 业务与崩溃共用的写入入口。 */
export function writeSessionLog(input: Omit<SessionLogInput, "sessionId">) {
	try {
		writeRaw(input);
	} catch {
		// 日志失败静默
	}
}

export function getSessionLogInfo() {
	if (!state) {
		return null;
	}
	return {
		sessionId: state.sessionId,
		logsDir: state.logsDir,
		logPath: state.logPath,
		phase: state.phase,
	};
}

export function setSessionLogCorrelation(corr: SessionLogCorrelation) {
	if (!state) {
		return;
	}
	state.corr = { ...state.corr, ...corr };
}

export function clearSessionLogRecordingId() {
	if (!state) {
		return;
	}
	const { recordingId: _removed, ...rest } = state.corr;
	state.corr = rest;
}

export function getSessionLogPhase(): SessionLogPhase | null {
	return state?.phase ?? null;
}

export function registerSessionLogChildProcess(name: string, pid: number | undefined) {
	if (!state || !pid || pid <= 0) {
		return;
	}
	state.childProcesses.set(pid, name);
}

export function unregisterSessionLogChildProcess(pid: number | undefined) {
	if (!state || !pid) {
		return;
	}
	state.childProcesses.delete(pid);
}

export function setSessionLogCaptureContext(
	capture: SessionLogState["captureContext"],
) {
	if (!state) {
		return;
	}
	state.captureContext = capture;
}

function isEditorWindow(window: BrowserWindow) {
	try {
		const url = new URL(window.webContents.getURL());
		return url.searchParams.get("windowType") === "editor";
	} catch {
		return false;
	}
}

/** 录/导/字幕时让编辑器预览停转，避免和采集抢 GPU。 */
function broadcastPreviewYield(active: boolean) {
	for (const window of BrowserWindow.getAllWindows()) {
		if (window.isDestroyed() || !isEditorWindow(window)) {
			continue;
		}
		window.webContents.send("preview-yield", { active });
	}
}

export function setSessionLogPhase(phase: SessionLogPhase) {
	if (!state) {
		return;
	}
	if (state.phase === phase) {
		return;
	}
	state.phase = phase;
	const yieldPreview =
		phase === "recording" || phase === "mux" || phase === "export" || phase === "captions";
	broadcastPreviewYield(yieldPreview);
	writeSessionLog({
		level: "info",
		scope: "resource",
		event: "resource.snapshot",
		msg: `phase=${phase}`,
		data: collectResourceSnapshot(phase),
	});
	rescheduleResourceSampler();
}

export function ingestRendererSessionLog(raw: RendererSessionLogPayload) {
	const parsed = parseRendererSessionLogPayload(raw);
	if (!parsed) {
		return { success: false as const };
	}
	if (parsed.level === "debug" && !state?.debugEnabled) {
		return { success: true as const };
	}
	if (parsed.event === "export.start") {
		setSessionLogPhase("export");
	} else if (parsed.event === "export.complete" || parsed.event === "export.failed") {
		setSessionLogPhase("editor");
	}
	writeSessionLog(parsed);
	return { success: true as const };
}

function collectResourceSnapshot(phase: SessionLogPhase) {
	const mem = process.memoryUsage();
	let metrics: Array<{ type: string; pid: number; cpu: number; memMb: number }> = [];
	try {
		metrics = app.getAppMetrics().map((item) => ({
			type: String(item.type),
			pid: item.pid,
			cpu: item.cpu?.percentCPUUsage ?? 0,
			memMb: Math.round(((item.memory?.workingSetSize ?? 0) / 1024) * 10) / 10,
		}));
	} catch {
		metrics = [];
	}

	const children = [...(state?.childProcesses.entries() ?? [])].map(([pid, name]) => ({
		name,
		pid,
	}));

	return {
		phase,
		mem: {
			appRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
			appHeapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
			systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
			systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
		},
		cpu: {
			systemLoad1: os.loadavg()[0] ?? null,
		},
		processes: metrics,
		children,
		capture: state?.captureContext ?? null,
	};
}

function rescheduleResourceSampler() {
	if (!state) {
		return;
	}
	if (state.resourceTimer) {
		clearInterval(state.resourceTimer);
		state.resourceTimer = null;
	}
	const intervalMs = state.phase === "idle" ? 30_000 : 5_000;
	state.resourceTimer = setInterval(() => {
		if (!state) {
			return;
		}
		writeSessionLog({
			level: "info",
			scope: "resource",
			event: "resource.snapshot",
			data: collectResourceSnapshot(state.phase),
		});
	}, intervalMs);
	state.resourceTimer.unref?.();
}

export function hookConsoleToSessionLog() {
	if (!state || state.consoleHooked) {
		return;
	}
	state.consoleHooked = true;
	const originals = state.originalConsole;

	const forward = (level: SessionLogLevel, event: string, args: unknown[]) => {
		if (!state || state.writingGuard) {
			return;
		}
		state.writingGuard = true;
		try {
			writeSessionLog({
				level,
				scope: "console",
				event,
				msg: stringifyConsoleArgs(args),
			});
		} finally {
			state.writingGuard = false;
		}
	};

	console.warn = (...args: unknown[]) => {
		originals.warn.apply(console, args);
		forward("warn", "console.warn", args);
	};
	console.error = (...args: unknown[]) => {
		originals.error.apply(console, args);
		forward("error", "console.error", args);
	};
}

export function installSessionProcessHandlers() {
	process.on("uncaughtException", (error) => {
		writeSessionLog({
			level: "error",
			scope: "app",
			event: "app.uncaught",
			msg: error.message,
			data: sessionLogErrorFields(error),
		});
	});
	process.on("unhandledRejection", (reason) => {
		writeSessionLog({
			level: "error",
			scope: "app",
			event: "app.unhandled-rejection",
			data: sessionLogErrorFields(reason),
		});
	});
	app.on("child-process-gone", (_event, details) => {
		writeSessionLog({
			level: "error",
			scope: "app",
			event: "app.child-process-gone",
			data: details,
		});
	});
	app.on("render-process-gone", (_event, _webContents, details) => {
		writeSessionLog({
			level: "error",
			scope: "app",
			event: "app.render-gone",
			data: details,
		});
	});
}

export function attachWebContentsConsoleLogging(contents: Electron.WebContents) {
	contents.on("console-message", (event) => {
		const level = event.level;
		if (level !== "warning" && level !== "error") {
			return;
		}
		writeSessionLog({
			level: level === "error" ? "error" : "warn",
			scope: "renderer",
			event: level === "error" ? "renderer.console-error" : "renderer.console-warn",
			msg: event.message,
			data: { line: event.lineNumber, source: event.sourceId },
		});
	});
}

export async function startSessionLog() {
	const logsDir = path.join(app.getPath("userData"), "logs");
	await fs.mkdir(logsDir, { recursive: true });
	await pruneOldSessionLogs(logsDir);

	const sessionId = randomUUID();
	const logPath = path.join(logsDir, formatSessionLogFileName(new Date(), process.pid));
	const stream = createWriteStream(logPath, { flags: "a" });
	stream.on("error", () => {
		if (state?.stream === stream) {
			state.stream = null;
		}
	});

	state = {
		sessionId,
		logsDir,
		logPath,
		stream,
		bytes: 0,
		lines: 0,
		truncated: false,
		debugEnabled: debugEnabledFromEnv(),
		corr: {},
		phase: "idle",
		consoleHooked: false,
		resourceTimer: null,
		writingGuard: false,
		childProcesses: new Map(),
		captureContext: null,
		originalConsole: {
			log: console.log.bind(console),
			warn: console.warn.bind(console),
			error: console.error.bind(console),
		},
	};

	try {
		await fs.writeFile(
			path.join(logsDir, "latest.json"),
			JSON.stringify(
				{
					sessionId,
					logPath,
					startedAt: new Date().toISOString(),
				},
				null,
				2,
			),
			"utf8",
		);
	} catch {
		// 指针失败不影响主日志
	}

	writeSessionLog({
		level: "info",
		scope: "app",
		event: "app.start",
		msg: "session started",
		data: {
			appVersion: app.getVersion(),
			electron: process.versions.electron,
			osRelease: os.release(),
			platform: process.platform,
			arch: process.arch,
			userData: app.getPath("userData"),
			recordingsDir: path.join(app.getPath("userData"), "recordings"),
			logPath,
			isPackaged: app.isPackaged,
			cpuCount: os.cpus().length,
			systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
			...collectResourceSnapshot("idle"),
		},
	});

	hookConsoleToSessionLog();
	installSessionProcessHandlers();
	rescheduleResourceSampler();
	return getSessionLogInfo();
}

export function endSessionLog(reason = "quit") {
	if (!state) {
		return;
	}
	writeSessionLog({
		level: "info",
		scope: "app",
		event: "app.exit",
		msg: reason,
		data: collectResourceSnapshot(state.phase),
	});
	if (state.resourceTimer) {
		clearInterval(state.resourceTimer);
	}
	const stream = state.stream;
	state.stream = null;
	state = null;
	try {
		stream?.end();
	} catch {
		// ignore
	}
}

export { sessionLogErrorFields };
