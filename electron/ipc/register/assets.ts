import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, ipcMain } from "electron";
import { USER_DATA_PATH } from "../../appPaths";
import { getMimeTypeForAssetPath, resolveWallpaperSourcePath } from "../assets/wallpaperPath";
import { getAssetRootPath } from "../project/manager";
import { normalizePath } from "../utils";

function toJpegDataUrl(jpegData: Buffer): string {
	return `data:image/jpeg;base64,${jpegData.toString("base64")}`;
}

export function registerAssetHandlers() {
	async function resolveReadableLocalFilePath(filePath: string) {
		const normalizedPath = normalizePath(filePath);
		const resolvedPath = await fs.realpath(normalizedPath).catch(() => normalizedPath);
		const stats = await fs.stat(resolvedPath);
		if (!stats.isFile()) {
			throw new Error("Path is not a readable file");
		}
		return normalizePath(resolvedPath);
	}

	function resolveBundledOrLocalPath(filePath: string): string {
		return resolveWallpaperSourcePath(filePath, getAssetRootPath());
	}

	// 缩略图走 data URL 字符串，不走 Buffer。contextBridge 传 TypedArray 在打包窗会丢成空对象，
	// 渲染进程再 new Uint8Array({}) 得到空图并缓存，网格就会一直裂。
	const THUMB_SIZE = 96;
	const thumbCacheDir = path.join(USER_DATA_PATH, "wallpaper-thumbs");
	let thumbGenerationQueue: Promise<void> = Promise.resolve();

	ipcMain.handle("generate-wallpaper-thumbnail", async (_, filePath: string) => {
		try {
			const resolved = await resolveReadableLocalFilePath(
				resolveBundledOrLocalPath(filePath),
			);

			const stat = await fs.stat(resolved);
			const cacheKey = Buffer.from(`${resolved}:${stat.mtimeMs}`).toString("base64url");
			const thumbPath = path.join(thumbCacheDir, `${cacheKey}.jpg`);

			if (existsSync(thumbPath)) {
				const data = await fs.readFile(thumbPath);
				return { success: true, dataUrl: toJpegDataUrl(data) };
			}

			let jpegData: Buffer;
			const generation = thumbGenerationQueue.then(async () => {
				const { nativeImage } = await import("electron");
				const img = nativeImage.createFromPath(resolved);
				if (img.isEmpty()) {
					throw new Error("Failed to load image");
				}
				const { width, height } = img.getSize();
				const scale = THUMB_SIZE / Math.min(width, height);
				const resized = img.resize({
					width: Math.round(width * scale),
					height: Math.round(height * scale),
					quality: "good",
				});
				jpegData = resized.toJPEG(70);

				await fs.mkdir(thumbCacheDir, { recursive: true });
				await fs.writeFile(thumbPath, jpegData);
			});
			thumbGenerationQueue = generation.catch(() => undefined);
			await generation;

			return { success: true, dataUrl: toJpegDataUrl(jpegData!) };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	// 打包态预览/选中壁纸：整图也走 data URL，不依赖 HTTP /wallpapers（asar 里没有这些文件）。
	ipcMain.handle("resolve-bundled-asset-path", async (_, filePath: string) => {
		try {
			const resolved = await resolveReadableLocalFilePath(
				resolveBundledOrLocalPath(filePath),
			);
			return { success: true, path: resolved };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("read-bundled-asset-data-url", async (_, filePath: string) => {
		try {
			const resolved = await resolveReadableLocalFilePath(
				resolveBundledOrLocalPath(filePath),
			);
			const data = await fs.readFile(resolved);
			const mime = getMimeTypeForAssetPath(resolved);
			if (!mime.startsWith("image/")) {
				return { success: false, error: "Not an image asset" };
			}
			return {
				success: true,
				dataUrl: `data:${mime};base64,${data.toString("base64")}`,
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	// Return base path for assets so renderer can resolve file:// paths in production
	ipcMain.handle("get-asset-base-path", () => {
		if (!app.isPackaged) {
			return null;
		}

		try {
			const assetPath = getAssetRootPath();
			return pathToFileURL(`${assetPath}${path.sep}`).toString();
		} catch (err) {
			console.error("Failed to resolve asset base path:", err);
			return null;
		}
	});

	ipcMain.handle("list-asset-directory", async (_, relativeDir: string) => {
		try {
			const normalizedRelativeDir = String(relativeDir ?? "")
				.replace(/\\/g, "/")
				.replace(/^\/+/, "");

			const assetRootPath = path.resolve(getAssetRootPath());
			const targetDirPath = path.resolve(assetRootPath, normalizedRelativeDir);
			if (
				targetDirPath !== assetRootPath &&
				!targetDirPath.startsWith(`${assetRootPath}${path.sep}`)
			) {
				return { success: false, error: "Invalid asset directory" };
			}

			const entries = await fs.readdir(targetDirPath, { withFileTypes: true });
			const files = entries
				.filter((entry) => entry.isFile())
				.map((entry) => entry.name)
				.sort(new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare);

			return { success: true, files };
		} catch (error) {
			console.error("Failed to list asset directory:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("read-local-file", async (_, filePath: string) => {
		try {
			// Intentionally more permissive than the media-server allowlist: this IPC
			// is used for direct renderer-side local file reads after the app has
			// already accepted a path, while URL-based media serving must stay scoped
			// to approved/app-managed locations. We still canonicalize the path and
			// require a real on-disk file so this cannot be used to read directories.
			const resolved = await resolveReadableLocalFilePath(filePath);

			const data = await fs.readFile(resolved);
			return { success: true, data };
		} catch (error) {
			console.error("Failed to read local file:", error);
			return { success: false, error: String(error) };
		}
	});
}
