# 10 · 问题：每次启动录制都提示本机 Windows 采集失败并回退浏览器

> 2026-09-06 用户点名 + 真机 toast + 两次会话日志。  
> **本轮只落文档，产品代码等你明示「开始做」再改。**  
> 想先把「为什么起不来、两条采集差在哪」读明白：见 [`11-理解_本机采集与浏览器采集.md`](11-理解_本机采集与浏览器采集.md)。

## 1. 现象

每次点开始录制，都会弹出：

> **本机 Windows 采集启动失败，已回退到浏览器采集。**

对应 i18n：`common.toasts.nativeWindowsStartFailed`。  
不是「不可用 / 无法检测」那两条，而是 **可用性检查过了，真正 `spawn` 失败**。

| 项 | 内容 |
|----|------|
| 角色 | 培训师，录软件操作 |
| 金路径 | 启动录制 → 停止 → 编辑 → 导出 |
| 落点 | **G1** 录得稳（本机 WGC 才是 Windows 主采集） |
| 复现 | 解压 `recordly-portable-1.4.0-beta.6`，双击目录里的 `electron.exe`，选屏幕后点录制 |
| 本机 OS | Windows 10.0.19044（21H2，满足 WGC 的 19041+） |
| 发生次数 | 同包连续两次启动都失败（18:43、19:03） |

回退后录制仍能走浏览器采集，金路径没有当场断死，但成片质量、鼠标、下拉菜单、资源占用都会走弱路径（与 `R20260906-09` / `10` / `12` 叠在一起）。

## 2. 证据（会话日志，不是猜）

日志目录：`%APPDATA%\Electron\logs\`（身份是 Electron，不是 Recordly-dev）。

| 文件 | 启动头关键字段 | 启动录制错误 |
|------|----------------|--------------|
| `recordly-20260906-184251-pid30788.log` | `isPackaged: false`，`userData: …\Roaming\Electron` | `spawn …\app.asar\electron\native\bin\win32-x64\wgc-capture.exe ENOENT` |
| `recordly-20260906-190308-pid11804.log` | 同上 | 同上 |

同一会话里 **光标 helper 也是同一类错**：

```
spawn …\app.asar\electron\native\bin\win32-x64\cursor-monitor.exe ENOENT
```

磁盘上 **真实文件在 unpacked 里，不在 asar 里**：

```
release-portable/recordly-portable-1.4.0-beta.6/resources/app.asar.unpacked/electron/native/bin/win32-x64/wgc-capture.exe
```

`electron-builder.json5` 的 `asarUnpack` 已包含 `electron/native/bin/**`。打包没有漏文件，是 **运行时路径指错了**。

## 3. 因果链（根因）

```
对内身份 = productName / executableName = Electron
        ↓
Portable 主程序叫 electron.exe
        ↓
Electron 43 把这次启动判成未打包：app.isPackaged === false
（会话日志第一行写死了）
        ↓
resolveUnpackedAppPath() 只在 isPackaged 为真时
才把 …\app.asar\… 改成 …\app.asar.unpacked\…
        ↓
getWindowsCaptureExePath() 得到 asar 虚拟路径
        ↓
fs.access(asar 路径) 成功  →  isNativeWindowsCaptureAvailable() = true
（Electron 能「看见」asar 里的条目；X_OK 也能过）
        ↓
child_process.spawn(asar 路径) 失败 ENOENT
（操作系统不能从 asar 归档里执行 exe）
        ↓
toast：本机 Windows 采集启动失败，已回退到浏览器采集
```

对应源码：

| 环节 | 位置 | 行为 |
|------|------|------|
| 只在打包态改写路径 | `electron/ipc/paths/binaries.ts` `resolveUnpackedAppPath` | `if (app.isPackaged) replace(.asar → .asar.unpacked)` |
| 可用性 | `electron/ipc/recording/windows.ts` `isNativeWindowsCaptureAvailable` | `fs.access(exePath, X_OK)`，不区分 asar / 真文件 |
| 启动 | `electron/ipc/register/recording.ts` `spawn(exePath, …)` | 失败进 catch → `success: false` |
| 回退 toast | `src/hooks/useScreenRecorder.ts` | `nativeWindowsStartFailed` |

**不是** WGC 本身坏了，也不是 Win10 19044 不支持，也不是 `wgc-capture.exe` 没打进包。

同机对照：Whisper 已经踩过「不要依赖 `isPackaged`」——`electron/ipc/captions/whisperModelPaths.ts` 写明「Portable / 安装包认 exe 旁 resources/whisper，不依赖 `app.isPackaged`」。采集 helper 还没改到同一口径。

## 4. 为什么每次都会出现

路径解析是启动时算死的，不随选源变化。  
只要还是这个 Portable 包、还是 `electron.exe` 身份，**每一次** `startNativeScreenRecording` 都会 `spawn` 到 asar 里，每一次都会回退。

`pnpm dev`（`VITE_DEV_SERVER_URL` + `Recordly-dev`）走源码树里的预置 exe，一般不会踩这条。所以开发态容易「以为采集是好的」，Portable 真机必现。

## 5. 解决方案（等确认后再改代码）

闸门：Windows → G1 录得稳 → 不过度设计 → 不改录→停→编→导步骤 → 不改 Electron 身份（R19 已拍板）。

### 推荐（低风险，先做）

只修路径，**不改** `productName` / `executableName`（改身份会再被内网拦）。

1. **`resolveUnpackedAppPath`：看见 `.asar/` 或 `.asar\` 就改写成 `.asar.unpacked`，不要再用 `app.isPackaged` 当开关。**  
   与 ffmpeg 静态二进制、Whisper 模型同一原则。
2. **可用性检查跟 spawn 用同一条「真磁盘路径」。**  
   若改写后文件不存在，再报「不可用」；不要对 asar 虚拟路径 `access` 成功却去 spawn。
3. **补测试**：`isPackaged: false` 且 `getAppPath()` 指向 `…\resources\app.asar` 时，必须解析到 `app.asar.unpacked\…\wgc-capture.exe`。现有 `binaries.test.ts` 只覆盖了开发树，没覆盖「Electron 身份的 Portable」。
4. **同一改动顺带修 `cursor-monitor.exe`。** 本次日志里它已经同样 ENOENT，不修则自动缩放 / 鼠标轨迹在 Portable 上继续空。

改完后 **重打 Portable ZIP** 再验。旧的 `1.4.0-beta.6` 目录不会自己好。

### 不推荐

| 做法 | 原因 |
|------|------|
| 把 helper 改放到 extraResources | 面更大；asarUnpack 已经做对了 |
| 把 exe 改名为 Recordly.exe | 破坏「Electron 默认身份」代决 |
| 关掉本机采集、默认浏览器 | 培训师金路径变弱，且掩盖打包 bug |
| 只改 toast 文案 | 不解决 spawn |

### 六问

| 问 | 答 |
|----|----|
| 服务哪个 G | G1 录得稳；顺带 G4（少一条吓人的失败 toast） |
| 不过度设计？ | 改路径函数 + 测试，不动采集引擎 |
| 回归？ | 开发态预置 exe 路径不变；真打包态才走 unpacked |
| 用户真需要？ | 要。浏览器回退会丢 WGC 的成片质量 |
| 会困惑吗？ | 不改操作；修好后 toast 不应再出 |
| 奇怪影响？ | 身份保持 Electron；userData 仍在 `%APPDATA%\Electron` |

### 怎么验（改完后）

1. 重打 `npm run build:win:portable`，解压新目录。  
2. 双击 `electron.exe`，选屏幕，点录制。  
3. **不应再出现**这条 toast。  
4. 打开 `%APPDATA%\Electron\logs\` 最新一份：应有 `capture.start` / `native windows capture started`，`helperPath` 含 `app.asar.unpacked`，不应再有 `spawn …\app.asar\…\wgc-capture.exe ENOENT`。  
5. 同一份日志里 `cursor-monitor` 的 helperPath 也应是 unpacked。  
6. 停录进编辑器，成片应是本机 WGC 文件，而不是浏览器回退片。

## 6. 对工作流

未改录→停→编→导步骤。修好前的规避：用 `pnpm dev` 录（走源码 helper），或接受浏览器采集（质量较差）。正式改法见上一节，等你说「开始做」。
