import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRequestedFilePath } from "./rendererServer";

describe("resolveRequestedFilePath", () => {
	it("把 /wallpapers 指到 extraResources，而不是 asar 里的 dist", () => {
		const distRoot = path.resolve("D:/fake-app/dist");
		const wallpaperRoot = path.resolve("D:/fake-app/resources/assets/wallpapers");
		const resolved = resolveRequestedFilePath(distRoot, "/wallpapers/tahoe-light.jpg", {
			wallpapers: wallpaperRoot,
		});
		expect(resolved).toBe(path.join(wallpaperRoot, "tahoe-light.jpg"));
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
