import path from "node:path";

export const BUNDLED_WHISPER_MODEL_NAME = "ggml-small.bin";
/** small 完整权重约 466MB；更小的多半是半截下载，不能当可用模型。 */
export const MIN_WHISPER_MODEL_BYTES = 400 * 1024 * 1024;

/**
 * Portable / 安装包认 exe 旁 resources/whisper，不依赖 app.isPackaged。
 * 开发态再补仓库 .tmp。
 */
export function collectBundledWhisperModelCandidates(input: {
	resourcesPath?: string | null;
	execPath?: string | null;
	appPath?: string | null;
	cwd?: string | null;
}): string[] {
	const name = BUNDLED_WHISPER_MODEL_NAME;
	const seen = new Set<string>();
	const candidates: string[] = [];
	const push = (filePath: string) => {
		const resolved = path.resolve(filePath);
		if (seen.has(resolved)) return;
		seen.add(resolved);
		candidates.push(resolved);
	};

	const execDir = input.execPath?.trim() ? path.dirname(input.execPath) : "";
	if (execDir) {
		push(path.join(execDir, "resources", "whisper", name));
		push(path.join(execDir, "whisper", name));
	}
	if (input.resourcesPath?.trim()) {
		push(path.join(input.resourcesPath, "whisper", name));
		push(path.join(input.resourcesPath, name));
	}
	if (input.appPath?.trim()) {
		push(path.join(input.appPath, "..", "whisper", name));
		push(path.join(input.appPath, "whisper", name));
	}
	if (input.cwd?.trim()) {
		push(path.join(input.cwd, "resources", "whisper", name));
		push(path.join(input.cwd, ".tmp", "whisper-models", name));
	}

	return candidates;
}
