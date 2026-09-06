import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRequestedFilePath } from "./rendererServer";

describe("resolveRequestedFilePath", () => {
	let tempRoot = "";

	afterEach(async () => {
		if (tempRoot) {
			await fs.rm(tempRoot, { recursive: true, force: true });
			tempRoot = "";
		}
	});

	async function makeTempLayout() {
		tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-renderer-"));
		const distWallpapers = path.join(tempRoot, "dist", "wallpapers");
		const extraWallpapers = path.join(tempRoot, "resources", "assets", "wallpapers");
		await fs.mkdir(distWallpapers, { recursive: true });
		await fs.mkdir(extraWallpapers, { recursive: true });
		return { distRoot: path.join(tempRoot, "dist"), extraWallpapers, distWallpapers };
	}

	it("extraResources 里有文件时优先走 extraRoots", async () => {
		const { distRoot, extraWallpapers } = await makeTempLayout();
		await fs.writeFile(path.join(extraWallpapers, "tahoe-light.jpg"), "extra");
		const resolved = resolveRequestedFilePath(distRoot, "/wallpapers/tahoe-light.jpg", {
			wallpapers: extraWallpapers,
		});
		expect(resolved).toBe(path.join(extraWallpapers, "tahoe-light.jpg"));
	});

	it("extraRoots 可以是函数，按调用时取值", async () => {
		const { distRoot, extraWallpapers } = await makeTempLayout();
		await fs.writeFile(path.join(extraWallpapers, "tahoe-light.jpg"), "extra");
		const resolved = resolveRequestedFilePath(distRoot, "/wallpapers/tahoe-light.jpg", () => ({
			wallpapers: extraWallpapers,
		}));
		expect(resolved).toBe(path.join(extraWallpapers, "tahoe-light.jpg"));
	});

	it("extraRoots 指空目录时回退 asar dist，避免 HTTP 整段 404", async () => {
		const { distRoot, extraWallpapers, distWallpapers } = await makeTempLayout();
		await fs.writeFile(path.join(distWallpapers, "tahoe-light.jpg"), "dist");
		const resolved = resolveRequestedFilePath(distRoot, "/wallpapers/tahoe-light.jpg", {
			wallpapers: extraWallpapers,
		});
		expect(resolved).toBe(path.join(distWallpapers, "tahoe-light.jpg"));
	});

	it("拒绝 /wallpapers/../ 跳出资源目录", () => {
		const distRoot = path.resolve("D:/fake-app/dist");
		const wallpaperRoot = path.resolve("D:/fake-app/resources/assets/wallpapers");
		const resolved = resolveRequestedFilePath(distRoot, "/wallpapers/../secret.txt", {
			wallpapers: wallpaperRoot,
		});
		expect(resolved).toBeNull();
	});
});
