import { describe, expect, it } from "vitest";
import {
	formatSessionLogFileName,
	formatSessionLogLine,
	isSessionLogFileName,
	listSessionLogsToPrune,
	parseRendererSessionLogPayload,
	shouldWriteSessionLogLevel,
} from "./sessionLogFormat";

describe("sessionLogFormat", () => {
	it("用本地墙钟和 pid 生成互不撞车的文件名", () => {
		const name = formatSessionLogFileName(new Date(2026, 8, 6, 18, 15, 2), 4242);
		expect(name).toBe("recordly-20260906-181502-pid4242.log");
		expect(isSessionLogFileName(name)).toBe(true);
		expect(isSessionLogFileName("latest.json")).toBe(false);
	});

	it("超过保留份数时只删最旧的会话文件", () => {
		const names = [
			"latest.json",
			"recordly-20260906-100000-pid1.log",
			"recordly-20260906-110000-pid2.log",
			"recordly-20260906-120000-pid3.log",
		];
		expect(listSessionLogsToPrune(names, 2)).toEqual(["recordly-20260906-100000-pid1.log"]);
	});

	it("JSONL 一行一事，默认不写 debug", () => {
		const line = formatSessionLogLine({
			level: "info",
			scope: "recording",
			event: "recording.started",
			sessionId: "s1",
			corr: { recordingId: "r1" },
			msg: "started",
		});
		expect(line.endsWith("\n")).toBe(true);
		const parsed = JSON.parse(line) as { event: string; corr: { recordingId: string } };
		expect(parsed.event).toBe("recording.started");
		expect(parsed.corr.recordingId).toBe("r1");
		expect(shouldWriteSessionLogLevel("debug", false)).toBe(false);
		expect(shouldWriteSessionLogLevel("error", false)).toBe(true);
	});

	it("拒绝渲染进程灌入的非法日志", () => {
		expect(parseRendererSessionLogPayload({ level: "info" })).toBeNull();
		expect(
			parseRendererSessionLogPayload({
				level: "error",
				scope: "ui",
				event: "ui.toast",
				msg: "boom",
			}),
		).toMatchObject({ event: "ui.toast", msg: "boom" });
	});
});
