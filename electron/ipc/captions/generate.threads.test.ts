import { describe, expect, it } from "vitest";
import { resolveWhisperThreadLimit } from "./whisperThreads";

describe("resolveWhisperThreadLimit", () => {
	it("至少 2 线程", () => {
		expect(resolveWhisperThreadLimit(1)).toBe(2);
		expect(resolveWhisperThreadLimit(2)).toBe(2);
	});

	it("默认用一半逻辑核", () => {
		expect(resolveWhisperThreadLimit(8)).toBe(4);
		expect(resolveWhisperThreadLimit(16)).toBe(8);
	});
});
