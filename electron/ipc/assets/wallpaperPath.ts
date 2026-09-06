import path from "node:path";

/**
 * 把渲染进程传来的壁纸引用落到 extraResources 磁盘路径。
 *
 * 开发态 Vite 把 public/wallpapers 挂在 /wallpapers，img 直接能出图。
 * 打包后 builder 排除了 dist/wallpapers，同一条 /wallpapers/foo.jpg
 * 在 Windows 上会被当成盘符根路径，必须先映射到 resources/assets/wallpapers。
 *
 * 也接受 http://127.0.0.1:<port>/wallpapers/… 和 file://…/wallpapers/…。
 */
export function resolveWallpaperSourcePath(filePath: string, assetRootPath: string): string {
	const input = String(filePath ?? "").trim();
	if (!input) {
		return input;
	}

	const withoutQuery = input.split(/[?#]/)[0] ?? input;
	const posix = withoutQuery.replace(/\\/g, "/");
	const match = posix.match(/(?:^|\/)wallpapers\/(.+)$/i);
	if (match?.[1]) {
		const relativeFile = safeDecodeURIComponent(match[1]);
		if (!relativeFile || relativeFile.split("/").includes("..")) {
			return input;
		}
		return path.join(assetRootPath, "wallpapers", relativeFile);
	}

	const isWindowsAbsolute = /^[A-Za-z]:/.test(posix) || posix.startsWith("//");
	const isPosixAbsolute = posix.startsWith("/");
	if (!isWindowsAbsolute && !isPosixAbsolute && posix.startsWith("wallpapers/")) {
		const relativeFile = safeDecodeURIComponent(posix.slice("wallpapers/".length));
		if (!relativeFile || relativeFile.split("/").includes("..")) {
			return input;
		}
		return path.join(assetRootPath, "wallpapers", relativeFile);
	}

	return input;
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function getMimeTypeForAssetPath(filePath: string): string {
	const normalized = filePath.split("?")[0]?.toLowerCase() ?? filePath.toLowerCase();
	if (normalized.endsWith(".png")) return "image/png";
	if (normalized.endsWith(".webp")) return "image/webp";
	if (normalized.endsWith(".gif")) return "image/gif";
	if (normalized.endsWith(".svg")) return "image/svg+xml";
	if (normalized.endsWith(".avif")) return "image/avif";
	if (
		normalized.endsWith(".mp4") ||
		normalized.endsWith(".webm") ||
		normalized.endsWith(".mov")
	) {
		return "application/octet-stream";
	}
	return "image/jpeg";
}
