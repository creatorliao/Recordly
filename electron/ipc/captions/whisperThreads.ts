import os from "node:os";

/** 字幕识别默认最多用一半逻辑核，至少 2，避免打满整机。 */
export function resolveWhisperThreadLimit(cpuCount = os.cpus().length) {
	return Math.max(2, Math.floor(Math.max(1, cpuCount) / 2));
}
