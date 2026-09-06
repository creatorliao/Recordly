import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

export const WINDOWS_CMAKE_GENERATORS = Object.freeze([
	{ name: "Visual Studio 18 2026", label: "VS 2026", toolset: "v143" },
	{ name: "Visual Studio 17 2022", label: "VS 2022" },
	{ name: "Visual Studio 16 2019", label: "VS 2019" },
]);

export const WINDOWS_VISUAL_STUDIO_INSTALL_DIRS = Object.freeze(["18", "2022", "2019"]);

export function configureWithWindowsCmakeGenerator({
	prefix,
	configure,
	clearCache,
	log = console.log,
}) {
	let lastError;

	for (let index = 0; index < WINDOWS_CMAKE_GENERATORS.length; index += 1) {
		const generator = WINDOWS_CMAKE_GENERATORS[index];
		clearCache();

		try {
			configure(generator.name, generator.toolset);
			return generator.name;
		} catch (error) {
			lastError = error;
			const nextGenerator = WINDOWS_CMAKE_GENERATORS[index + 1];
			if (nextGenerator) {
				log(
					`[${prefix}] ${generator.label} generator unavailable, trying ${nextGenerator.label}...`,
				);
			}
		}
	}

	throw lastError;
}

export function findVcvars64() {
	const editions = ["BuildTools", "Community", "Professional", "Enterprise"];
	const versions = WINDOWS_VISUAL_STUDIO_INSTALL_DIRS;
	const roots = [
		path.join("C:", "Program Files (x86)", "Microsoft Visual Studio"),
		path.join("C:", "Program Files", "Microsoft Visual Studio"),
	];
	for (const root of roots) {
		for (const version of versions) {
			for (const edition of editions) {
				const vcvars = path.join(
					root,
					version,
					edition,
					"VC",
					"Auxiliary",
					"Build",
					"vcvars64.bat",
				);
				if (existsSync(vcvars)) {
					return vcvars;
				}
			}
		}
	}
	return null;
}

/**
 * VS 生成器找不到已登记实例时，用 vcvars64 + NMake 配置并编译。
 * extraCmakeArgs 例如 `-DFOO=bar`（不要带 -G）。
 * @returns {boolean} 是否走了 NMake（true 则调用方不要再 cmake --build）
 */
export function tryNmakeAfterVsGeneratorFailure({
	prefix,
	cmake,
	buildDir,
	clearCache,
	extraCmakeArgs = "",
	log = console,
}) {
	const vcvars = findVcvars64();
	if (!vcvars) {
		return false;
	}

	log.warn?.(`[${prefix}] Visual Studio 生成器未注册实例，改用 vcvars64 + NMake。`);
	clearCache();
	const cmakeExe = String(cmake).replace(/^"|"$/g, "");
	const extra = extraCmakeArgs ? ` ${extraCmakeArgs}` : "";
	const nmakeCmdPath = path.join(buildDir, "_nmake-build.cmd");
	writeFileSync(
		nmakeCmdPath,
		[
			"@echo off",
			`call "${vcvars}"`,
			"if errorlevel 1 exit /b 1",
			`cd /d "${buildDir}"`,
			`"${cmakeExe}" .. -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Release${extra}`,
			"if errorlevel 1 exit /b 1",
			`"${cmakeExe}" --build .`,
			"exit /b %ERRORLEVEL%",
		].join("\r\n"),
		"utf8",
	);
	execSync(`cmd.exe /c "${nmakeCmdPath}"`, {
		cwd: buildDir,
		stdio: "inherit",
		timeout: 300000,
	});
	return true;
}

export function resolveBuiltExe(buildDir, fileName) {
	const releasePath = path.join(buildDir, "Release", fileName);
	if (existsSync(releasePath)) {
		return releasePath;
	}
	return path.join(buildDir, fileName);
}
