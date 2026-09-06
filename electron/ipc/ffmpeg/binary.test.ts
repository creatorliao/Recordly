import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Portable 主程序叫 electron.exe 时 isPackaged 为假。
 * 这些用例锁住：看见 app.asar 就必须改写 unpacked，才能 spawn ffmpeg.exe。
 */
describe("ffmpeg bundled path", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.doMock("electron", () => ({
			app: {
				isPackaged: false,
				getAppPath: () => process.cwd(),
			},
		}));
	});

	afterEach(() => {
		vi.resetModules();
		vi.doUnmock("electron");
	});

	it("asar 虚拟路径与 unpacked 真路径能分开认", async () => {
		const { pathLooksInsideAsarArchive, pathLooksInsideAsarUnpacked } = await import("./binary");
		const asar = path.join("D:", "app", "resources", "app.asar", "node_modules", "ffmpeg.exe");
		const unpacked = path.join(
			"D:",
			"app",
			"resources",
			"app.asar.unpacked",
			"node_modules",
			"ffmpeg.exe",
		);

		expect(pathLooksInsideAsarArchive(asar)).toBe(true);
		expect(pathLooksInsideAsarUnpacked(asar)).toBe(false);
		expect(pathLooksInsideAsarArchive(unpacked)).toBe(false);
		expect(pathLooksInsideAsarUnpacked(unpacked)).toBe(true);
	});

	it("isPackaged 为假时，仍把 asar 路径改写到已存在的 unpacked exe", async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-ffmpeg-"));
		try {
			const asarPath = path.join(
				tempRoot,
				"resources",
				"app.asar",
				"node_modules",
				"ffmpeg-static",
				"ffmpeg.exe",
			);
			const unpackedPath = path.join(
				tempRoot,
				"resources",
				"app.asar.unpacked",
				"node_modules",
				"ffmpeg-static",
				"ffmpeg.exe",
			);
			await fs.mkdir(path.dirname(unpackedPath), { recursive: true });
			await fs.writeFile(unpackedPath, "ffmpeg");

			const { resolveBundledExecutablePath } = await import("./binary");
			expect(resolveBundledExecutablePath(asarPath)).toBe(unpackedPath);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("开发树没有 asar 分段时保持原路径", async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-ffmpeg-dev-"));
		try {
			const devPath = path.join(tempRoot, "node_modules", "ffmpeg-static", "ffmpeg.exe");
			await fs.mkdir(path.dirname(devPath), { recursive: true });
			await fs.writeFile(devPath, "ffmpeg");

			const { resolveBundledExecutablePath, pathLooksInsideAsarArchive } =
				await import("./binary");
			expect(pathLooksInsideAsarArchive(devPath)).toBe(false);
			expect(resolveBundledExecutablePath(devPath)).toBe(devPath);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
