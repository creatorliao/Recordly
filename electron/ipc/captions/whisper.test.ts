import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectBundledWhisperModelCandidates } from "./whisperModelPaths";

describe("collectBundledWhisperModelCandidates", () => {
	it("Portable 解压后优先认 exe 旁 resources/whisper", () => {
		const portableRoot = path.join(path.parse(process.cwd()).root, "RecordlyPortable");
		const execPath = path.join(portableRoot, "Electron.exe");
		const candidates = collectBundledWhisperModelCandidates({
			execPath,
			resourcesPath: path.join(portableRoot, "resources"),
			cwd: path.join(path.parse(process.cwd()).root, "Users", "trainer"),
		});

		expect(candidates[0]).toBe(
			path.resolve(portableRoot, "resources", "whisper", "ggml-small.bin"),
		);
		expect(
			candidates.some((candidate) =>
				candidate.endsWith(path.join(".tmp", "whisper-models", "ggml-small.bin")),
			),
		).toBe(true);
	});

	it("不依赖 isPackaged：只给 exe 也能拼出解压目录模型路径", () => {
		const unzipRoot = path.join(path.parse(process.cwd()).root, "unzip");
		const candidates = collectBundledWhisperModelCandidates({
			execPath: path.join(unzipRoot, "Electron.exe"),
		});
		expect(candidates).toContain(
			path.resolve(unzipRoot, "resources", "whisper", "ggml-small.bin"),
		);
	});
});
