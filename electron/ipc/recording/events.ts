import { BrowserWindow } from "electron";
import { writeSessionLog } from "../../sessionLog";

export function emitRecordingInterrupted(reason: string, message: string) {
	writeSessionLog({
		level: "error",
		scope: "recording",
		event: "recording.interrupted",
		msg: message,
		data: { reason, userMessage: message },
	});
	BrowserWindow.getAllWindows().forEach((window) => {
		if (!window.isDestroyed()) {
			window.webContents.send("recording-interrupted", { reason, message });
		}
	});
}
