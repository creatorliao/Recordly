/**
 * 只打 Windows ZIP（解压即跑）。文件名固定为 recordly-portable-<package.json 版本>.zip
 * 不改 NSIS 的 artifactName，避免安装包也叫 portable。
 *
 * 模板里的 ${version}/${ext} 交给 electron-builder 替换，不要写成 JS 模板字符串。
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const artifactName = "recordly-portable-${version}.${ext}";

console.log(
	`[build-win-portable] 将产出 recordly-portable-${pkg.version}.zip（electron-builder 替换版本号）`,
);

const electronBuilderCli = createRequire(import.meta.url).resolve("electron-builder/cli.js");
const result = spawnSync(
	process.execPath,
	[
		electronBuilderCli,
		"--win",
		"zip",
		`-c.win.artifactName=${artifactName}`,
		// 避开可能被占用的 release/win-unpacked（上次安装包或正在运行的目录）
		"-c.directories.output=release-portable",
	],
	{ stdio: "inherit", cwd: projectRoot },
);

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}
