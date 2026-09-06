/**
 * 为本机 Windows 准备 CMake，供 cursor-monitor / WGC 等原生 helper 编译。
 * 顺序：已在 PATH → 常见安装路径 → 仓库 tools/cmake → winget → 官方 zip。
 */
import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Readable } from "node:stream";

const projectRoot = process.cwd();
const toolsRoot = path.join(projectRoot, "tools");
const cmakeVersion = "3.31.6";
const cmakeZipName = `cmake-${cmakeVersion}-windows-x86_64`;
const cmakeZipUrl = `https://github.com/Kitware/CMake/releases/download/v${cmakeVersion}/${cmakeZipName}.zip`;
const localCmakeExe = path.join(toolsRoot, cmakeZipName, "bin", "cmake.exe");

function cmakeWorks(command) {
	try {
		execSync(`"${command}" --version`, { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

function findExistingCmake() {
	if (cmakeWorks("cmake")) {
		return "cmake";
	}

	const candidates = [
		localCmakeExe,
		path.join("C:", "Program Files", "CMake", "bin", "cmake.exe"),
		path.join("C:", "Program Files (x86)", "CMake", "bin", "cmake.exe"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate) && cmakeWorks(candidate)) {
			return candidate;
		}
	}

	return null;
}

function tryWinget() {
	try {
		execSync(
			"winget install -e --id Kitware.CMake --accept-package-agreements --accept-source-agreements",
			{ stdio: "inherit", timeout: 180000 },
		);
		return findExistingCmake();
	} catch (error) {
		console.warn("[ensure-windows-cmake] winget 安装失败，改下官方 zip：", error.message);
		return null;
	}
}

async function downloadOfficialZip() {
	mkdirSync(toolsRoot, { recursive: true });
	const zipPath = path.join(toolsRoot, `${cmakeZipName}.zip`);
	console.log(`[ensure-windows-cmake] 下载 ${cmakeZipUrl}`);
	const response = await fetch(cmakeZipUrl);
	if (!response.ok || !response.body) {
		throw new Error(`下载 CMake 失败：HTTP ${response.status}`);
	}
	await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath));

	execSync(
		`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${toolsRoot.replace(/'/g, "''")}'"`,
		{ stdio: "inherit", timeout: 120000 },
	);

	if (!existsSync(localCmakeExe)) {
		throw new Error(`解压后未找到 ${localCmakeExe}`);
	}
	return localCmakeExe;
}

const existing = findExistingCmake();
if (existing) {
	console.log(`[ensure-windows-cmake] 已有 CMake：${existing}`);
	process.exit(0);
}

if (process.platform !== "win32") {
	console.log("[ensure-windows-cmake] 非 Windows，跳过。");
	process.exit(0);
}

console.log("[ensure-windows-cmake] 本机没有 CMake，开始安装…");
const fromWinget = tryWinget();
if (fromWinget) {
	console.log(`[ensure-windows-cmake] winget 完成：${fromWinget}`);
	process.exit(0);
}

try {
	const downloaded = await downloadOfficialZip();
	console.log(`[ensure-windows-cmake] 已放到仓库 tools：${downloaded}`);
	process.exit(0);
} catch (error) {
	console.error("[ensure-windows-cmake] 自动安装失败：", error.message);
	process.exit(1);
}
