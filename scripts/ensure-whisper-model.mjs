/**
 * 打包前确认本机已有 ggml-small.bin。不把 466MB 模型提交进 git。
 * 先用代理下到 .tmp/whisper-models/，再被 electron-builder extraResources 带走。
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const modelPath = path.join(projectRoot, ".tmp", "whisper-models", "ggml-small.bin");
const MIN_BYTES = 400 * 1024 * 1024;

if (!existsSync(modelPath)) {
	throw new Error(
		`[ensure-whisper-model] 缺少 ${modelPath}。请先用本机代理下载 ggml-small.bin 到该路径。`,
	);
}

const size = statSync(modelPath).size;
if (size < MIN_BYTES) {
	throw new Error(
		`[ensure-whisper-model] ${modelPath} 只有 ${size} 字节，不像完整 small 模型。`,
	);
}

console.log(`[ensure-whisper-model] 已就绪 ${modelPath}（${(size / 1024 / 1024).toFixed(1)} MB）`);
