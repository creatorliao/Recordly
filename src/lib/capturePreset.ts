/**
 * 采集档：默认按培训够用，高档可选。
 * 金路径按钮不变，只改帧率/最长边/码率真值。
 */

export const CAPTURE_PRESET_VALUES = ["economy", "standard", "high"] as const;

export type CapturePreset = (typeof CAPTURE_PRESET_VALUES)[number];

export type CaptureProfile = {
	preset: CapturePreset;
	/** 目标帧率 */
	fps: number;
	/** 浏览器采集 ideal/max 最长边；原生路径目前只作日志，编码仍跟源分辨率 */
	maxLongEdge: number;
	/** 目标码率；high 为 null 表示沿用编码器按分辨率估算 */
	bitrateBps: number | null;
};

export const DEFAULT_CAPTURE_PRESET: CapturePreset = "standard";

const PROFILES: Record<CapturePreset, CaptureProfile> = {
	economy: {
		preset: "economy",
		fps: 24,
		maxLongEdge: 1280,
		bitrateBps: 6_000_000,
	},
	standard: {
		preset: "standard",
		fps: 30,
		maxLongEdge: 1920,
		bitrateBps: 10_000_000,
	},
	high: {
		preset: "high",
		fps: 60,
		maxLongEdge: 3840,
		bitrateBps: null,
	},
};

/** 非法或空值回落到标准档，避免旧设置把默认打回 4K60。 */
export function normalizeCapturePreset(value: unknown): CapturePreset {
	return typeof value === "string" &&
		(CAPTURE_PRESET_VALUES as readonly string[]).includes(value)
		? (value as CapturePreset)
		: DEFAULT_CAPTURE_PRESET;
}

export function resolveCaptureProfile(value: unknown): CaptureProfile {
	return PROFILES[normalizeCapturePreset(value)];
}

/**
 * 浏览器回退路径的码率：有档位码率就用档位；高档沿用原 4K/QHD 表。
 */
export function resolveBrowserCaptureBitrate(
	profile: CaptureProfile,
	width: number,
	height: number,
): number {
	if (profile.bitrateBps != null) {
		return profile.bitrateBps;
	}

	const pixels = Math.max(1, width) * Math.max(1, height);
	const fourK = 3840 * 2160;
	const qhd = 2560 * 1440;
	const base = pixels >= fourK ? 45_000_000 : pixels >= qhd ? 28_000_000 : 18_000_000;
	return profile.fps >= 60 ? Math.round(base * 1.7) : base;
}

/** 把源矩形收进最长边，两边都做成偶数（H.264）。 */
export function fitEvenSize(
	width: number,
	height: number,
	maxLongEdge: number,
): { width: number; height: number } {
	const srcW = Math.max(2, Math.round(width));
	const srcH = Math.max(2, Math.round(height));
	const longEdge = Math.max(srcW, srcH);
	if (longEdge <= maxLongEdge) {
		return { width: srcW - (srcW % 2), height: srcH - (srcH % 2) };
	}
	const scale = maxLongEdge / longEdge;
	let nextW = Math.max(2, Math.round(srcW * scale));
	let nextH = Math.max(2, Math.round(srcH * scale));
	nextW -= nextW % 2;
	nextH -= nextH % 2;
	return { width: nextW, height: nextH };
}
