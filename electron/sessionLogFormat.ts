/** 会话日志的纯函数契约：文件名、JSONL 行、保留策略、渲染进程载荷校验。不碰 Electron。 */

export const SESSION_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type SessionLogLevel = (typeof SESSION_LOG_LEVELS)[number];

export const SESSION_LOG_PHASES = [
	"idle",
	"recording",
	"mux",
	"editor",
	"export",
	"captions",
] as const;
export type SessionLogPhaseName = (typeof SESSION_LOG_PHASES)[number];

/**
 * 只有导出和字幕识别才停编辑器预览。
 * 录制 / mux 与「停录立刻回放」重叠，不能让路，否则画面闪、声画都起不来。
 */
export function shouldYieldPreviewForPhase(phase: SessionLogPhaseName): boolean {
	return phase === "export" || phase === "captions";
}

export const SESSION_LOG_MAX_BYTES = 8 * 1024 * 1024;
export const SESSION_LOG_MAX_LINES = 20_000;
export const SESSION_LOG_KEEP_COUNT = 20;
export const SESSION_LOG_MSG_MAX = 2_000;
export const SESSION_LOG_DATA_MAX = 8_192;
export const SESSION_LOG_FIELD_MAX = 64;

export type SessionLogCorrelation = {
	recordingId?: string;
	exportId?: string;
};

export type SessionLogInput = {
	level: SessionLogLevel;
	scope: string;
	event: string;
	sessionId: string;
	corr?: SessionLogCorrelation;
	msg?: string;
	data?: unknown;
	ts?: string;
};

const FILE_NAME_RE = /^recordly-\d{8}-\d{6}-pid\d+\.log$/u;

function pad2(value: number) {
	return String(value).padStart(2, "0");
}

/** 本地墙钟文件名，避免一次启动两份撞车（带 pid）。 */
export function formatSessionLogFileName(date: Date, pid: number) {
	const stamp = [
		date.getFullYear(),
		pad2(date.getMonth() + 1),
		pad2(date.getDate()),
		"-",
		pad2(date.getHours()),
		pad2(date.getMinutes()),
		pad2(date.getSeconds()),
	].join("");
	return `recordly-${stamp}-pid${pid}.log`;
}

export function isSessionLogFileName(name: string) {
	return FILE_NAME_RE.test(name);
}

/** 按文件名时间升序，返回应删除的旧文件名（超过 keep 份）。 */
export function listSessionLogsToPrune(names: string[], keep = SESSION_LOG_KEEP_COUNT) {
	const logs = names.filter(isSessionLogFileName).sort();
	if (logs.length <= keep) {
		return [];
	}
	return logs.slice(0, logs.length - keep);
}

export function truncateText(value: string, max: number) {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max)}…`;
}

function sanitizeScopeOrEvent(value: string) {
	const trimmed = value.trim().slice(0, SESSION_LOG_FIELD_MAX);
	return trimmed.length > 0 ? trimmed : "unknown";
}

export function serializeSessionLogData(data: unknown) {
	if (data === undefined) {
		return undefined;
	}
	try {
		const raw = JSON.stringify(data);
		if (raw.length <= SESSION_LOG_DATA_MAX) {
			return data;
		}
		return { truncated: true, preview: `${raw.slice(0, SESSION_LOG_DATA_MAX)}…` };
	} catch {
		return { unserializable: true };
	}
}

export function formatSessionLogLine(input: SessionLogInput) {
	const line = {
		ts: input.ts ?? new Date().toISOString(),
		level: input.level,
		scope: sanitizeScopeOrEvent(input.scope),
		event: sanitizeScopeOrEvent(input.event),
		sessionId: input.sessionId,
		...(input.corr && Object.keys(input.corr).length > 0 ? { corr: input.corr } : {}),
		...(input.msg ? { msg: truncateText(input.msg, SESSION_LOG_MSG_MAX) } : {}),
		...(input.data !== undefined ? { data: serializeSessionLogData(input.data) } : {}),
	};
	return `${JSON.stringify(line)}\n`;
}

export function isSessionLogLevel(value: unknown): value is SessionLogLevel {
	return (
		typeof value === "string" && (SESSION_LOG_LEVELS as readonly string[]).includes(value)
	);
}

export function shouldWriteSessionLogLevel(
	level: SessionLogLevel,
	debugEnabled: boolean,
) {
	if (level === "debug") {
		return debugEnabled;
	}
	return true;
}

/** 把未知错误收成可入档的字段，避免丢 name。 */
export function sessionLogErrorFields(error: unknown) {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { message: String(error) };
}

export type RendererSessionLogPayload = {
	level?: unknown;
	scope?: unknown;
	event?: unknown;
	msg?: unknown;
	data?: unknown;
	corr?: unknown;
};

/** 渲染进程 IPC 入站校验：非法字段整条丢弃，防止灌爆。 */
export function parseRendererSessionLogPayload(raw: RendererSessionLogPayload) {
	if (!isSessionLogLevel(raw.level) || raw.level === "debug") {
		if (!isSessionLogLevel(raw.level)) {
			return null;
		}
	}
	if (typeof raw.scope !== "string" || typeof raw.event !== "string") {
		return null;
	}
	const corr =
		raw.corr && typeof raw.corr === "object" && !Array.isArray(raw.corr)
			? {
					recordingId:
						typeof (raw.corr as SessionLogCorrelation).recordingId === "string"
							? truncateText((raw.corr as SessionLogCorrelation).recordingId ?? "", 80)
							: undefined,
					exportId:
						typeof (raw.corr as SessionLogCorrelation).exportId === "string"
							? truncateText((raw.corr as SessionLogCorrelation).exportId ?? "", 80)
							: undefined,
				}
			: undefined;

	return {
		level: raw.level as SessionLogLevel,
		scope: raw.scope,
		event: raw.event,
		msg: typeof raw.msg === "string" ? raw.msg : undefined,
		data: raw.data,
		corr,
	};
}
