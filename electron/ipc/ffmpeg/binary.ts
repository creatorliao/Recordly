import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { app } from "electron";
import { rewriteAsarToUnpacked } from "../paths/binaries";

const nodeRequire = createRequire(import.meta.url);

export function loadFfmpegStatic(): string | null {
	try {
		const moduleExports = nodeRequire("ffmpeg-static");
		if (typeof moduleExports === "string") {
			return moduleExports;
		}

		if (typeof moduleExports?.default === "string") {
			return moduleExports.default as string;
		}
	} catch {
		// ffmpeg-static not available; fall through to system FFmpeg
	}

	return null;
}

export function loadFfprobeStatic(): string | null {
	try {
		const moduleExports = nodeRequire("ffprobe-static");
		if (typeof moduleExports === "string") {
			return moduleExports;
		}

		if (typeof moduleExports?.path === "string") {
			return moduleExports.path as string;
		}

		if (typeof moduleExports?.default === "string") {
			return moduleExports.default as string;
		}

		if (typeof moduleExports?.default?.path === "string") {
			return moduleExports.default.path as string;
		}
	} catch {
		// ffprobe-static not available; fall through to system FFprobe
	}

	return null;
}

export function resolveSystemFfmpegBinaryPath(): string | null {
	const locator = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(locator, ["ffmpeg"], {
		encoding: "utf-8",
		windowsHide: true,
	});

	if (result.status === 0) {
		const candidate = result.stdout
			.split(/\r?\n/)
			.map((line: string) => line.trim())
			.find((line: string) => line.length > 0);

		if (candidate) {
			return candidate;
		}
	}

	// Fallback: check common install paths directly (Electron's shell may lack full PATH)
	if (process.platform !== "win32") {
		const commonPaths = [
			"/opt/homebrew/bin/ffmpeg",
			"/usr/local/bin/ffmpeg",
			"/usr/bin/ffmpeg",
		];
		for (const p of commonPaths) {
			if (existsSync(p)) {
				return p;
			}
		}
	}

	return null;
}

export function resolveSystemFfprobeBinaryPath(): string | null {
	const locator = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(locator, ["ffprobe"], {
		encoding: "utf-8",
		windowsHide: true,
	});

	if (result.status === 0) {
		const candidate = result.stdout
			.split(/\r?\n/)
			.map((line: string) => line.trim())
			.find((line: string) => line.length > 0);

		if (candidate) {
			return candidate;
		}
	}

	if (process.platform !== "win32") {
		const commonPaths = [
			"/opt/homebrew/bin/ffprobe",
			"/usr/local/bin/ffprobe",
			"/usr/bin/ffprobe",
		];
		for (const p of commonPaths) {
			if (existsSync(p)) {
				return p;
			}
		}
	}

	return null;
}

/** 落在 asar 虚拟段（不含 unpacked）。Electron 能 access，操作系统不能 spawn。 */
export function pathLooksInsideAsarArchive(candidate: string): boolean {
	return /\.asar([/\\])/.test(candidate) && !/\.asar\.unpacked([/\\])/.test(candidate);
}

export function pathLooksInsideAsarUnpacked(candidate: string): boolean {
	return /\.asar\.unpacked([/\\])/.test(candidate);
}

/**
 * 打包进 asarUnpack 的 exe：看见 .asar 就改写 unpacked，不看 isPackaged。
 * Portable 主程序叫 electron.exe 时 Electron 43 会把 isPackaged 判成 false，
 * 旧逻辑会把 ffmpeg-static 的 asar 路径直接拿去 spawn（ENOENT）。
 */
export function resolveBundledExecutablePath(rawPath: string | null): string | null {
	if (!rawPath) {
		return null;
	}
	const rewritten = rewriteAsarToUnpacked(rawPath);
	if (existsSync(rewritten)) {
		return rewritten;
	}
	return null;
}

export type FfmpegBinarySource = "ffmpeg-static" | "system" | "missing";

/** 给导出会话日志用：raw / resolved / 是否还在 asar，便于确认 Portable 已走 unpacked。 */
export type FfmpegBinaryResolution = {
	rawPath: string | null;
	resolvedPath: string | null;
	source: FfmpegBinarySource;
	isPackaged: boolean;
	rawInAsar: boolean;
	resolvedInUnpacked: boolean;
	rawExists: boolean;
	resolvedExists: boolean;
};

export function inspectFfmpegBinaryResolution(): FfmpegBinaryResolution {
	const rawPath = loadFfmpegStatic();
	const bundledPath = resolveBundledExecutablePath(rawPath);
	const systemPath = bundledPath ? null : resolveSystemFfmpegBinaryPath();
	const resolvedPath = bundledPath ?? systemPath;
	const source: FfmpegBinarySource = bundledPath
		? "ffmpeg-static"
		: systemPath
			? "system"
			: "missing";

	return {
		rawPath,
		resolvedPath,
		source,
		isPackaged: app.isPackaged,
		rawInAsar: Boolean(rawPath && pathLooksInsideAsarArchive(rawPath)),
		resolvedInUnpacked: Boolean(resolvedPath && pathLooksInsideAsarUnpacked(resolvedPath)),
		rawExists: Boolean(rawPath && existsSync(rawPath)),
		resolvedExists: Boolean(resolvedPath && existsSync(resolvedPath)),
	};
}

export function getFfmpegBinaryPath(): string {
	const inspection = inspectFfmpegBinaryResolution();
	if (inspection.resolvedPath) {
		return inspection.resolvedPath;
	}

	throw new Error(
		"FFmpeg binary is unavailable. Install ffmpeg-static for this platform or make ffmpeg available on PATH.",
	);
}

export function getFfprobeBinaryPath(): string {
	const bundledPath = resolveBundledExecutablePath(loadFfprobeStatic());
	if (bundledPath) {
		return bundledPath;
	}

	const systemFfprobe = resolveSystemFfprobeBinaryPath();
	if (systemFfprobe) {
		return systemFfprobe;
	}

	throw new Error(
		"FFprobe binary is unavailable. Install ffprobe-static for this platform or make ffprobe available on PATH.",
	);
}
