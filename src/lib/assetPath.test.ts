import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAssetPath,
	getBundledWallpaperRelativePath,
	getExportableVideoUrl,
	getRenderableAssetUrl,
	getRenderableVideoUrl,
	getWallpaperThumbnailUrl,
	resolveEditorWallpaperDisplayUrl,
	shouldUseRootRelativeAssetImg,
} from "./assetPath";

describe("getAssetPath", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("HTTP 渲染窗口走站点根路径，不用 file://（打包 img 才能命中 /wallpapers）", async () => {
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(
					async () => "file:///Applications/Recordly.app/Contents/Resources/assets/",
				),
			},
		});

		await expect(getAssetPath("wallpapers/tahoe-light.jpg")).resolves.toBe(
			"/wallpapers/tahoe-light.jpg",
		);
	});

	it("uses root-relative assets when the dev server has no packaged asset base", async () => {
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => null),
			},
		});

		await expect(getAssetPath("wallpapers/tahoe-light.jpg")).resolves.toBe(
			"/wallpapers/tahoe-light.jpg",
		);
	});
});

describe("getRenderableAssetUrl", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("打包态捆绑壁纸改走 IPC data URL，不用 /wallpapers 当 img src", async () => {
		const readBundledAssetDataUrl = vi.fn(async () => ({
			success: true,
			dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
		}));
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => "file:///D:/Recordly/resources/assets/"),
				readBundledAssetDataUrl,
			},
		});

		await expect(getRenderableAssetUrl("/wallpapers/tahoe-light.jpg")).resolves.toBe(
			"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
		);
		expect(readBundledAssetDataUrl).toHaveBeenCalledWith("wallpapers/tahoe-light.jpg");
	});

	it("keeps absolute POSIX image paths on the local-file path", async () => {
		const readLocalFile = vi.fn(async () => ({
			success: false,
		}));
		vi.stubGlobal("window", {
			electronAPI: {
				readLocalFile,
			},
		});

		await expect(getRenderableAssetUrl("/Users/egg/Desktop/bg.jpg")).resolves.toBe(
			"file:///Users/egg/Desktop/bg.jpg",
		);
		expect(readLocalFile).toHaveBeenCalledWith("/Users/egg/Desktop/bg.jpg");
	});
});

describe("getRenderableVideoUrl", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the local media server for absolute local video paths when available", async () => {
		vi.stubGlobal("window", {
			electronAPI: {
				getLocalMediaUrl: vi.fn(async (filePath: string) => ({
					success: true,
					url: `http://127.0.0.1:4321/video?path=${encodeURIComponent(filePath)}`,
				})),
			},
		});

		await expect(getRenderableVideoUrl("/Users/egg/Desktop/bg.mp4")).resolves.toBe(
			"http://127.0.0.1:4321/video?path=%2FUsers%2Fegg%2FDesktop%2Fbg.mp4",
		);
	});

	it("falls back to a file URL for absolute local video paths", async () => {
		await expect(getRenderableVideoUrl("/Users/egg/Desktop/bg.mp4")).resolves.toBe(
			"file:///Users/egg/Desktop/bg.mp4",
		);
	});

	it("keeps bundled wallpaper paths routed through the app asset directory", async () => {
		vi.stubGlobal("window", {
			location: {
				protocol: "http:",
			},
		});

		await expect(getRenderableVideoUrl("/wallpapers/wispysky.mp4")).resolves.toBe(
			"/wallpapers/wispysky.mp4",
		);
	});
});

describe("getExportableVideoUrl", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses a direct file URL for absolute local video paths", async () => {
		await expect(getExportableVideoUrl("/Users/egg/Desktop/bg.mp4")).resolves.toBe(
			"file:///Users/egg/Desktop/bg.mp4",
		);
	});

	it("keeps bundled wallpaper paths routed through the app asset directory", async () => {
		vi.stubGlobal("window", {
			location: {
				protocol: "http:",
			},
		});

		await expect(getExportableVideoUrl("/wallpapers/wispysky.mp4")).resolves.toBe(
			"/wallpapers/wispysky.mp4",
		);
	});
});

describe("bundled wallpaper preview routing", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("从 HTTP / file / 根路径抽出 wallpapers 相对路径", () => {
		expect(getBundledWallpaperRelativePath("/wallpapers/tahoe-light.jpg")).toBe(
			"wallpapers/tahoe-light.jpg",
		);
		expect(
			getBundledWallpaperRelativePath("http://127.0.0.1:9/wallpapers/midnight-8.jpg"),
		).toBe("wallpapers/midnight-8.jpg");
		expect(
			getBundledWallpaperRelativePath(
				"file:///D:/app/resources/assets/wallpapers/cityscape.jpg",
			),
		).toBe("wallpapers/cityscape.jpg");
	});

	it("打包态不能把 /wallpapers 当 img src", async () => {
		vi.stubGlobal("window", {
			electronAPI: {
				getAssetBasePath: vi.fn(async () => "file:///D:/app/resources/assets/"),
			},
		});
		await expect(shouldUseRootRelativeAssetImg()).resolves.toBe(false);
	});

	it("开发态可以继续用 /wallpapers", async () => {
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => null),
			},
		});
		await expect(shouldUseRootRelativeAssetImg()).resolves.toBe(true);
	});

	it("file:// 打包回退窗不能用 /wallpapers 当 img src", async () => {
		vi.stubGlobal("window", {
			location: { protocol: "file:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => null),
			},
		});
		await expect(shouldUseRootRelativeAssetImg()).resolves.toBe(false);
	});

	it("打包态展示 URL 失败时返回空串，不回退 /wallpapers", async () => {
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => "file:///D:/app/resources/assets/"),
				readBundledAssetDataUrl: vi.fn(async () => ({ success: false })),
			},
		});
		await expect(resolveEditorWallpaperDisplayUrl("/wallpapers/tahoe-light.jpg")).resolves.toBe(
			"",
		);
	});

	it("打包态视频壁纸走磁盘路径 + 本机媒体服务", async () => {
		const resolveBundledAssetPath = vi.fn(async () => ({
			success: true,
			path: "D:/app/resources/assets/wallpapers/wispysky.mp4",
		}));
		const getLocalMediaUrl = vi.fn(async () => ({
			success: true,
			url: "http://127.0.0.1:9/video?path=wispysky.mp4",
		}));
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => "file:///D:/app/resources/assets/"),
				resolveBundledAssetPath,
				getLocalMediaUrl,
			},
		});
		await expect(getRenderableVideoUrl("/wallpapers/wispysky.mp4")).resolves.toBe(
			"http://127.0.0.1:9/video?path=wispysky.mp4",
		);
		expect(resolveBundledAssetPath).toHaveBeenCalledWith("wallpapers/wispysky.mp4");
	});

	it("缩略图优先用主进程 dataUrl，空字节不缓存", async () => {
		const generateWallpaperThumbnail = vi.fn(async () => ({
			success: true,
			dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
		}));
		vi.stubGlobal("window", {
			location: { protocol: "http:" },
			electronAPI: {
				getAssetBasePath: vi.fn(async () => "file:///D:/app/resources/assets/"),
				generateWallpaperThumbnail,
			},
		});

		await expect(getWallpaperThumbnailUrl("/wallpapers/tahoe-light.jpg")).resolves.toBe(
			"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
		);
		expect(generateWallpaperThumbnail).toHaveBeenCalledWith("wallpapers/tahoe-light.jpg");
	});
});
