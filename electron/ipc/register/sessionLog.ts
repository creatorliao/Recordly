import { ipcMain, shell } from "electron";
import {
	getSessionLogInfo,
	ingestRendererSessionLog,
	setSessionLogCorrelation,
} from "../../sessionLog";

export function registerSessionLogHandlers() {
	ipcMain.handle("session-log-write", (_event, payload: unknown) => {
		if (!payload || typeof payload !== "object") {
			return { success: false };
		}
		return ingestRendererSessionLog(payload);
	});

	ipcMain.handle("session-log-info", () => {
		const info = getSessionLogInfo();
		return info
			? { success: true, ...info }
			: { success: false, message: "Session log is not started." };
	});

	ipcMain.handle("session-log-set-corr", (_event, corr: unknown) => {
		if (!corr || typeof corr !== "object") {
			return { success: false };
		}
		const recordingId =
			"recordingId" in corr && typeof corr.recordingId === "string"
				? corr.recordingId
				: undefined;
		const exportId =
			"exportId" in corr && typeof corr.exportId === "string" ? corr.exportId : undefined;
		setSessionLogCorrelation({ recordingId, exportId });
		return { success: true };
	});

	ipcMain.handle("open-logs-folder", async () => {
		const info = getSessionLogInfo();
		if (!info) {
			return { success: false, message: "Session log is not started." };
		}
		const openPathResult = await shell.openPath(info.logsDir);
		if (openPathResult) {
			return { success: false, error: openPathResult, message: "Failed to open logs folder." };
		}
		return { success: true, path: info.logsDir };
	});
}
