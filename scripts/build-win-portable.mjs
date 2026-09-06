/**
 * 只打 Windows 目录包（不解压、不打 zip）。
 * 最终文件夹：release/recordly-portable-<package.json 版本>/
 * 名字与过去解压 zip 之后的目录一致，直接双击其中的 electron.exe。
 *
 * 先打到 release/.portable-staging/，再搬进 release/，
 * 避免和 NSIS 的 release/win-unpacked 或正在运行的目录抢锁。
 * Windows 上 electron-builder 刚写完 exe 时 rename 常 EPERM，失败则复制。
 * 不改 NSIS 的 artifactName，避免安装包也叫 portable。
 *
 * 参数：`--promote-only` 跳过 builder，只把已有 staging/win-unpacked 搬到最终目录。
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const projectRoot = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const version = pkg.version;
const releaseRoot = path.join(projectRoot, "release");
const stagingRoot = path.join(releaseRoot, ".portable-staging");
const unpackedDir = path.join(stagingRoot, "win-unpacked");
const finalDirName = `recordly-portable-${version}`;
const finalDir = path.join(releaseRoot, finalDirName);
const relativeFinalDir = path.relative(projectRoot, finalDir);
const promoteOnly = process.argv.includes("--promote-only");

/** Windows 杀毒/资源管理器刚扫完目录时，删除和改名都会短暂 EPERM。 */
async function removeDirWithRetry(dir) {
	for (let attempt = 1; attempt <= 8; attempt += 1) {
		try {
			rmSync(dir, { recursive: true, force: true });
			return;
		} catch (error) {
			if (attempt === 8) {
				throw error;
			}
			await sleep(400 * attempt);
		}
	}
}

/** 优先改名；失败则整目录复制，避免卡在 EPERM。 */
async function publishUnpackedDir(fromDir, toDir) {
	await removeDirWithRetry(toDir);
	try {
		renameSync(fromDir, toDir);
		return;
	} catch (renameError) {
		console.warn(
			`[build-win-portable] rename 失败（${renameError.code ?? renameError}），改为复制到 ${relativeFinalDir}`,
		);
	}
	cpSync(fromDir, toDir, { recursive: true });
	await removeDirWithRetry(fromDir);
}

async function main() {
	console.log(
		`[build-win-portable] 将产出目录 ${relativeFinalDir}（electron-builder --win dir，不打 zip）`,
	);

	mkdirSync(releaseRoot, { recursive: true });

	if (!promoteOnly) {
		await removeDirWithRetry(stagingRoot);

		const electronBuilderCli = createRequire(import.meta.url).resolve("electron-builder/cli.js");
		const result = spawnSync(
			process.execPath,
			[
				electronBuilderCli,
				"--win",
				"dir",
				`-c.directories.output=${path.relative(projectRoot, stagingRoot)}`,
			],
			{ stdio: "inherit", cwd: projectRoot },
		);

		if (result.status !== 0) {
			process.exit(result.status ?? 1);
		}
	}

	if (!existsSync(unpackedDir)) {
		console.error(`[build-win-portable] 未找到 ${path.relative(projectRoot, unpackedDir)}`);
		process.exit(1);
	}

	try {
		await publishUnpackedDir(unpackedDir, finalDir);
	} catch (error) {
		console.error(
			`[build-win-portable] 无法写出 ${relativeFinalDir}。请先关掉正在运行的 Electron 再重打。`,
			error,
		);
		process.exit(1);
	}

	await removeDirWithRetry(stagingRoot);
	console.log(`[build-win-portable] 完成：${relativeFinalDir}（双击其中 electron.exe，无需解压）`);
}

await main();
