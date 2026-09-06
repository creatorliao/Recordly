import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mjs": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

let packagedRendererBaseUrl: string | null = null;
let packagedRendererServerStartPromise: Promise<string> | null = null;

function getContentType(filePath: string): string {
	return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function getCacheControl(filePath: string): string {
	// Vite fingerprints production assets, so they can be reused across the HUD,
	// picker, toast, and editor windows without revalidation. Keep index.html
	// uncached because it points at the current fingerprinted files.
	return /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(path.basename(filePath))
		? "public, max-age=31536000, immutable"
		: "no-cache";
}

/** HTTP 路径第一段 → 磁盘目录。函数形式按请求现取，避免启动瞬间路径还不对。 */
export type PackagedRendererExtraRoots =
	| Record<string, string>
	| (() => Record<string, string> | undefined);

function resolveExtraRoots(
	extraRoots?: PackagedRendererExtraRoots,
): Record<string, string> | undefined {
	return typeof extraRoots === "function" ? extraRoots() : extraRoots;
}

function isPathInsideRoot(resolvedFilePath: string, resolvedRootDir: string): boolean {
	return (
		resolvedFilePath === resolvedRootDir ||
		resolvedFilePath.startsWith(`${resolvedRootDir}${path.sep}`)
	);
}

export function resolveRequestedFilePath(
	rootDir: string,
	requestPathname: string,
	extraRoots?: PackagedRendererExtraRoots,
): string | null {
	const trimmedPathname = requestPathname === "/" ? "/index.html" : requestPathname;

	let decodedPathname: string;
	try {
		decodedPathname = decodeURIComponent(trimmedPathname);
	} catch {
		return null;
	}
	// 解码后再拦 ..，避免 /wallpapers/%2e%2e/ 跳出 extraResources。
	if (decodedPathname.split(/[/\\]/).includes("..")) {
		return null;
	}

	// path.normalize() on Windows converts / to \, making the leading-slash
	// regex fail and causing path.resolve to escape to the drive root.
	const normalizedPosix = path.posix.normalize(decodedPathname);
	const relativePath = normalizedPosix.replace(/^\/+/, "");

	if (!relativePath) {
		return null;
	}

	const firstSegment = relativePath.split("/")[0];
	const extraRoot = resolveExtraRoots(extraRoots)?.[firstSegment];
	if (extraRoot) {
		const rest = relativePath.slice(firstSegment.length).replace(/^[/\\]+/, "");
		const resolvedExtraRoot = path.resolve(extraRoot);
		const resolvedExtraFilePath = path.resolve(resolvedExtraRoot, rest);
		if (!isPathInsideRoot(resolvedExtraFilePath, resolvedExtraRoot)) {
			return null;
		}
		// extraResources 优先；文件不在时回退 asar dist（避免映射指错就把 HTTP 整段打死）。
		if (existsSync(resolvedExtraFilePath)) {
			return resolvedExtraFilePath;
		}
	}

	const resolvedRootDir = path.resolve(rootDir);
	const resolvedFilePath = path.resolve(resolvedRootDir, relativePath);

	if (!isPathInsideRoot(resolvedFilePath, resolvedRootDir)) {
		return null;
	}

	return resolvedFilePath;
}

async function servePackagedRendererRequest(
	rootDir: string,
	request: IncomingMessage,
	response: ServerResponse,
	extraRoots?: PackagedRendererExtraRoots,
): Promise<void> {
	try {
		const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
		const resolvedFilePath = resolveRequestedFilePath(rootDir, requestUrl.pathname, extraRoots);

		if (!resolvedFilePath) {
			response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
			response.end("Forbidden");
			return;
		}

		const filePath = resolvedFilePath;
		const fileContents = await fs.readFile(filePath);

		response.writeHead(200, {
			"Cache-Control": getCacheControl(filePath),
			"Content-Type": getContentType(filePath),
		});

		if (request.method === "HEAD") {
			response.end();
			return;
		}

		response.end(fileContents);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			response.end("Not Found");
			return;
		}

		response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Internal Server Error");
	}
}

export function getPackagedRendererBaseUrl(): string | null {
	return packagedRendererBaseUrl;
}

export async function ensurePackagedRendererServer(
	rootDir: string,
	extraRoots?: PackagedRendererExtraRoots,
): Promise<string> {
	if (packagedRendererBaseUrl) {
		return packagedRendererBaseUrl;
	}

	if (packagedRendererServerStartPromise) {
		return packagedRendererServerStartPromise;
	}

	packagedRendererServerStartPromise = new Promise((resolve, reject) => {
		const server = createServer((request, response) => {
			void servePackagedRendererRequest(rootDir, request, response, extraRoots);
		});

		server.once("error", (error) => {
			reject(error);
		});

		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Renderer server did not expose a TCP address"));
				return;
			}

			packagedRendererBaseUrl = `http://127.0.0.1:${address.port}`;
			resolve(packagedRendererBaseUrl);
		});
	});

	try {
		return await packagedRendererServerStartPromise;
	} finally {
		packagedRendererServerStartPromise = null;
	}
}
