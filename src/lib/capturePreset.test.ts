import { describe, expect, it } from "vitest";
import {
	fitEvenSize,
	normalizeCapturePreset,
	resolveBrowserCaptureBitrate,
	resolveCaptureProfile,
} from "./capturePreset";

describe("capturePreset", () => {
	it("空值回落到标准档 1080p30", () => {
		const profile = resolveCaptureProfile(undefined);
		expect(profile.preset).toBe("standard");
		expect(profile.fps).toBe(30);
		expect(profile.maxLongEdge).toBe(1920);
		expect(profile.bitrateBps).toBe(10_000_000);
	});

	it("非法值不当成高档", () => {
		expect(normalizeCapturePreset("4k60")).toBe("standard");
	});

	it("标准档浏览器码率用档位而不是 4K 表", () => {
		const profile = resolveCaptureProfile("standard");
		expect(resolveBrowserCaptureBitrate(profile, 3840, 2160)).toBe(10_000_000);
	});

	it("高档 4K60 仍走原码率表", () => {
		const profile = resolveCaptureProfile("high");
		expect(resolveBrowserCaptureBitrate(profile, 3840, 2160)).toBe(Math.round(45_000_000 * 1.7));
	});

	it("超过最长边时收成偶数", () => {
		expect(fitEvenSize(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
		expect(fitEvenSize(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
	});
});
