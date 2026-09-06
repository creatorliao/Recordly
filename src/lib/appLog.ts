/** 渲染进程写会话日志：经 IPC 落到本次启动的那一份文件。无 Electron 时静默。 */

export type AppLogLevel = "info" | "warn" | "error";

export type AppLogInput = {
	level: AppLogLevel;
	scope: string;
	event: string;
	msg?: string;
	data?: unknown;
	corr?: { recordingId?: string; exportId?: string };
};

export function appLog(input: AppLogInput) {
	if (typeof window === "undefined") {
		return;
	}
	const api = window.electronAPI;
	if (typeof api?.writeSessionLog !== "function") {
		return;
	}
	void api.writeSessionLog(input).catch(() => undefined);
}

export function setAppLogCorrelation(corr: { recordingId?: string; exportId?: string }) {
	if (typeof window === "undefined") {
		return;
	}
	const api = window.electronAPI;
	if (typeof api?.setSessionLogCorrelation !== "function") {
		return;
	}
	void api.setSessionLogCorrelation(corr).catch(() => undefined);
}
