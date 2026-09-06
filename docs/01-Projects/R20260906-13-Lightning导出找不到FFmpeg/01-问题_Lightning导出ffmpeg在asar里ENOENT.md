# 01 · 问题：Lightning 导出 spawn 进 asar，FFmpeg ENOENT

> 2026-09-06 用户在 `1.4.0-beta.9` Portable 上真机截图。  
> 角色：培训师。金路径：录 → 停 → 编 → **导出**。落点 **G1**。

## 1. 问题现状

播放已能走（beta.9 的 Pixi / helper 路径）。点导出后弹框：

> **Lightning (Beta) export failed.**  
> `spawn D:\code\Recordly\release-portable\recordly-portable-1.4.0-beta.9\resources\app.asar\node_modules\ffmpeg-static\ffmpeg.exe ENOENT`

| 项 | 内容 |
|----|------|
| 包 | 解压后的 `recordly-portable-1.4.0-beta.9`，主程序 `electron.exe` |
| 路径 | WebGPU + Breeze（`h264-stream-copy`） |
| 输出 | 1920×1080 @ 30 FPS，encoder 模式 auto |
| 含义 | 操作系统要执行 `ffmpeg.exe`，路径却指进 **asar 归档**（虚拟文件系统），exe 不能从归档里 spawn |

`electron-builder.json5` 的 `asarUnpack` **已经包含** `node_modules/ffmpeg-static/**`。  
磁盘上真实文件在：

```
…\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe
```

打包没有漏文件。运行时把路径指错了。

旧 beta.9 目录不会自己好，要等带本专题修复的新包。

## 2. 根本原因

和 `R20260906-04/10` 采集 helper **同一条因果链**，只是漏改了 FFmpeg：

```
对内身份 = productName / executableName = Electron
        ↓
Portable 主程序叫 electron.exe
        ↓
Electron 43：app.isPackaged === false
        ↓
getFfmpegBinaryPath() 只在 isPackaged 为真时
才把 ffmpeg-static 给出的 …\app.asar\… 改成 …\app.asar.unpacked\…
        ↓
existsSync(asar 虚拟路径) 成功（Electron 能「看见」归档条目）
        ↓
返回 asar 路径给 Lightning / Breeze
        ↓
child_process.spawn(asar 路径) → ENOENT
        ↓
弹框 Lightning (Beta) export failed
```

对应源码（修前）：

```119:128:electron/ipc/ffmpeg/binary.ts
export function getFfmpegBinaryPath(): string {
	const ffmpegStatic = loadFfmpegStatic();
	if (ffmpegStatic && typeof ffmpegStatic === "string") {
		const bundledPath = app.isPackaged
			? ffmpegStatic.replace(/\.asar([/\\])/, ".asar.unpacked$1")
			: ffmpegStatic;
```

采集 helper 已改成「看见 `.asar` 就改写」，不再看 `isPackaged`（`rewriteAsarToUnpacked`）。  
FFmpeg / FFprobe 还在用旧开关，所以录得了、播得了、**导不出**。

**不是** WebGPU / 驱动 / `h264_nvenc` 本身坏了。弹框后半段的编码器说明会把人带偏。

`ffprobe` 同一函数、同一坑；字幕抽音频、成片探测也会踩，这次弹框是 Lightning 默认导出先踩到。

## 3. 解决方案

闸门：Windows → G1 导出顺 → 不过度设计 → 不改录→停→编→导步骤 → 不改 Electron 身份。

### 已落地（低风险）

1. **`getFfmpegBinaryPath` / `getFfprobeBinaryPath` 复用 `rewriteAsarToUnpacked`**，看见 `.asar/` 或 `.asar\` 就改写，不看 `isPackaged`。
2. **`inspectFfmpegBinaryResolution()`** 把解析过程收成一条可入档对象（raw / resolved / 是否还在 asar / 文件是否存在）。
3. **Lightning 导出启动时写会话日志**（见下一节），方便你对账，而不是只看弹框。
4. **单测**：asar 路径 + `isPackaged: false` 必须解析到 unpacked。

不改：`productName`、默认导出管线、编码器选择、asarUnpack 清单（已经对了）。

### 六问

| 问 | 答 |
|----|------|
| 服务哪个 G | G1 导出顺 |
| 不过度设计？ | 复用已有改写函数 + 几条导出日志 |
| 回归？ | 开发态没有 `.asar` 分段，改写是空操作 |
| 用户真需要？ | 要。默认 Lightning 导不出去，金路径断 |
| 会困惑吗？ | 不改按钮；修好后不应再弹这条 ENOENT |
| 奇怪影响？ | 身份仍是 Electron；系统 PATH 上的 ffmpeg 仅在包内 exe 不存在时才回退 |

## 4. 日志：怎么确认已经真正修好

启动窗三点菜单 → **打开日志文件夹**（或 `%APPDATA%\Electron\logs`）。  
打开 `latest.json` 的 `logPath`，搜 `export.ffmpeg`。

| 事件 | 级别 | 修好后应看到 | 仍坏时会看到 |
|------|------|--------------|--------------|
| `export.ffmpeg.resolve` | info | `rawInAsar: true`（Portable 正常），`resolvedInUnpacked: true`，`resolvedExists: true`，`resolvedPath` 含 `app.asar.unpacked`，`source: "ffmpeg-static"` | `resolvedInUnpacked: false`，`resolvedPath` 仍含 `\app.asar\` 且不含 unpacked |
| `export.ffmpeg.spawn` | info | 有 `pid`，路径仍是 unpacked | 没有这条 |
| `export.ffmpeg.spawn-failed` | error | **不应再有** | `message` 含 `ENOENT`，路径含 `\app.asar\node_modules\ffmpeg-static\ffmpeg.exe` |

`isPackaged` 在 Electron 身份下**仍可能是 false**。这不是失败条件。只看路径有没有进 unpacked。

回我模板：

```
包：
export.ffmpeg.resolve：resolvedInUnpacked 是/否；resolvedPath=
export.ffmpeg.spawn-failed：无 / 有（贴 message）
导出结果：成功 / 仍弹 ENOENT / 其他：
```
