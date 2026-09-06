import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMimeTypeForAssetPath, resolveWallpaperSourcePath } from "./wallpaperPath";

const ASSET_ROOT = path.join("D:", "app", "resources", "assets");

describe("resolveWallpaperSourcePath", () => {
	it("把 /wallpapers/foo.jpg 落到 extraResources，不当 Windows 盘符根路径", () => {
		expect(resolveWallpaperSourcePath("/wallpapers/tahoe-light.jpg", ASSET_ROOT)).toBe(
			path.join(ASSET_ROOT, "wallpapers", "tahoe-light.jpg"),
		);
	});

	it("把相对 wallpapers/foo.jpg 落到 extraResources", () => {
		expect(resolveWallpaperSourcePath("wallpapers/midnight-8.jpg", ASSET_ROOT)).toBe(
			path.join(ASSET_ROOT, "wallpapers", "midnight-8.jpg"),
		);
	});

	it("从打包 HTTP 绝对地址抽出壁纸文件名", () => {
		expect(
			resolveWallpaperSourcePath(
				"http://127.0.0.1:41234/wallpapers/ipad-17-dark.jpg",
				ASSET_ROOT,
			),
		).toBe(path.join(ASSET_ROOT, "wallpapers", "ipad-17-dark.jpg"));
	});

	it("从 file:// 抽出壁纸文件名再落到当前资产根", () => {
		expect(
			resolveWallpaperSourcePath(
				"file:///D:/old-app/resources/assets/wallpapers/cityscape.jpg",
				ASSET_ROOT,
			),
		).toBe(path.join(ASSET_ROOT, "wallpapers", "cityscape.jpg"));
	});

	it("拒绝 wallpapers 段里的 ..", () => {
		expect(resolveWallpaperSourcePath("/wallpapers/../secret.txt", ASSET_ROOT)).toBe(
			"/wallpapers/../secret.txt",
		);
	});

	it("自定义上传的磁盘路径保持原样", () => {
		expect(resolveWallpaperSourcePath("D:/photos/custom-bg.jpg", ASSET_ROOT)).toBe(
			"D:/photos/custom-bg.jpg",
		);
	});
});

describe("getMimeTypeForAssetPath", () => {
	it("按扩展名给出图片 MIME", () => {
		expect(getMimeTypeForAssetPath("a.png")).toBe("image/png");
		expect(getMimeTypeForAssetPath("a.jpg")).toBe("image/jpeg");
		expect(getMimeTypeForAssetPath("a.webp")).toBe("image/webp");
	});
});
