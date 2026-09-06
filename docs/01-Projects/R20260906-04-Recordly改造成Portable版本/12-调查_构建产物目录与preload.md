# 12 · 调查：preload、两套 dist、两套 release、unpack 与 portable

> 调查日：2026-09-06。依据本仓库源码、忽略规则、磁盘产物，不靠聊天记忆。  
> 角色：培训师，金路径录→停→编→导。目标：G1 拿得到能跑的程序；G4 少而稳。仅 Windows。  
> 本文件只记事实与判断；改法见 [`13-方案_产物目录收敛与目录包不分发zip.md`](13-方案_产物目录收敛与目录包不分发zip.md)。

---

## 一、`preload.mjs` 是什么、为什么没进提交

| 项 | 事实 |
|----|------|
| 源码真源 | `electron/preload.ts`（进仓） |
| 运行时文件 | 主进程 `electron/windows.ts` 用「和自己同目录的 `preload.mjs`」加载预加载脚本 |
| 编译器 | Vite + `vite-plugin-electron`，入口在 `vite.config.ts` 的 `preload.input` |
| 正常落点 | `dist-electron/preload.mjs`（与 `main.cjs` 同目录） |
| 仓库根上那份 | 未跟踪文件；体积/时间戳与 `dist-electron/preload.mjs` 接近，是**另一次构建漏写到根目录**的压缩产物 |

它把 `ipcRenderer` / `contextBridge` 暴露成窗口上的 `electronAPI`（录制、导出、字幕、设置等）。**不是手写源码，是打包结果。**

没进提交的原因不是漏加，而是：

1. `.gitignore` 已忽略 `dist`、`dist-electron`，正常产物本来就不该提交。  
2. 根目录 `preload.mjs` **没有**写进忽略规则，所以一直出现在 `git status` 的未跟踪里，看起来像「该不该提交」。  
3. `package.json` 的 `"main"` 指向 `dist-electron/main.cjs`，开发/打包都不读仓库根的 `preload.mjs`。

**结论：** 不要提交根目录 `preload.mjs`。应忽略并删掉漏网文件。提交源码 `electron/preload.ts` 即可。

---

## 二、为什么会有两个 dist、两个 release

### 2.1 `dist` 与 `dist-electron`（编译中间物）

| 目录 | 谁写 | 里面是什么 | 谁读 |
|------|------|------------|------|
| `dist/` | Vite 渲染进程构建 | `index.html`、前端 `assets/`、壁纸/wasm 等 | 打包时打进 asar；主进程 `RENDERER_DIST` |
| `dist-electron/` | `vite-plugin-electron` | `main.cjs`、`preload.mjs` | `package.json` `"main"`；窗口 `preload` 路径 |

这是 **Vite + Electron 插件的默认两套 outDir**，不是两套产品。`.gitignore` 两边都忽略是对的。

磁盘现状（本机）：`dist/` 约网页资源；`dist-electron/` 仅两个文件。根目录多出来的 `preload.mjs` 属于第三份漏网，不是第三套体系。

### 2.2 `release` 与 `release-portable`（安装/分发产物）

| 目录 | 谁写 | 当初为什么分开 |
|------|------|----------------|
| `release/` | `npm run build:win` → `electron-builder --win`（NSIS） | 配置里 `directories.output: "release"`。中间目录固定叫 `win-unpacked/`，再打出安装向导 exe |
| `release-portable/` | `scripts/build-win-portable.mjs` 显式 `-c.directories.output=release-portable` | 避免和正在占用的 `release/win-unpacked` 抢目录（脚本注释写明） |

portable 脚本当前命令是 **`--win zip`**，所以除了 `win-unpacked/` 还会再压一份约 680MB+ 的 `recordly-portable-<version>.zip`。解压后又得到同名文件夹——**同一套文件打了两遍。**

本机还堆着 beta.6～beta.10 多份 zip，仅 zip 就约 3.5GB。

---

## 三、unpack 和 portable 分别指什么（容易混的三组词）

用户口中的「unpack」在本仓会撞上三个不同概念：

| 说法 | 实际是什么 | 和 portable 的关系 |
|------|------------|-------------------|
| **`win-unpacked`** | electron-builder 的 **`dir` 目标**（打 NSIS / zip 之前的展开目录） | 里面已经有 `electron.exe` + `resources/`，**双击就能跑**。zip portable 就是把这份目录压起来 |
| **`app.asar.unpacked`** | `electron-builder.json5` 的 **`asarUnpack`**：exe/原生模块不能进 asar 压缩包，必须摊在磁盘上给操作系统 `spawn` | 与「免安装分发」无关。安装包和目录包**都有**这一层。缺了会 ENOENT（采集 helper、ffmpeg） |
| **本仓 `build:win:portable`** | 我们自己的脚本名。实际打的是 **zip 目录包**，**不是** builder 的 `portable` 目标 | 解压后的文件夹 ≈ `win-unpacked`，只是名字改成 `recordly-portable-<version>` |

再对比 builder 官方词：

| 目标 | 用户拿到什么 | 本仓态度 |
|------|--------------|----------|
| `nsis` | 安装向导 exe | 备胎；内网常拦 |
| `dir` | 只有文件夹（`win-unpacked`） | **对内日常最合适**：不用再解压 |
| `zip` | 上面那个文件夹再打成压缩包 | 适合网传；本机自用多余 |
| `portable`（builder） | **单个**自解压 exe，先解到临时目录再跑 | 很像安装器；`03` 已定为默认不做 |

**一句话：**  
- `win-unpacked` = 已经解好的程序目录。  
- `asar.unpacked` = asar 里必须摊开的二进制。  
- 我们要的 portable = **免安装、目录里直接双击 exe**，不是再压一个 zip，更不是 builder 那种单文件自解压。

---

## 四、能不能靠改编译规则合成「一个 dist + 一个 release」

### 4.1 两个 dist → 一个 dist？

**能改，但不建议本轮硬合成一个扁平 `dist/`。**

| 做法 | 行不行 | 代价 |
|------|--------|------|
| 把 main/preload 的 `outDir` 改到 `dist/electron/` | 技术上可以 | 要改 `package.json` `main`、`main.ts` 的 `APP_ROOT`/`MAIN_DIST`、`windows.ts` 相对路径、normalize/smoke/benchmark、builder 的 `files`、biome 忽略。路径算错会直接开不了窗 |
| 渲染和主进程都写进 `dist/` 根下混放 | 不建议 | 前端 `assets/` 与 Node `main.cjs` 混在一起，打包范围难控 |
| **保持两套 outDir，忽略根漏网文件** | 推荐 | 零行为风险；磁盘上就是「编译两段、分发一段」 |

`tsc` 本身 `noEmit: true`，不产出第三套 JS。两套 dist 来自 **两套 Vite 构建**（渲染一份、Electron 主/预加载一份），不是配置写重了。

**本轮决策：** 不合并 `dist` 与 `dist-electron`。收益只是少一个顶层文件夹；风险碰金路径启动。

### 4.2 两个 release → 一个 release？

**能，而且应该。** 只改打包脚本，不动录制/编辑代码。

| 做法 | 说明 |
|------|------|
| portable 改为 `--win dir` | 不再生成 zip |
| 输出仍落到 `release/` | 取消专用 `release-portable/` |
| 把 `win-unpacked` **改名为** `recordly-portable-<version>` | 文件夹名与现在解压后一致 |
| 先打到 `release/.portable-staging/` 再搬过去 | 继续避开「NSIS 或正在运行的 `win-unpacked`」文件锁 |

NSIS 若再打，仍用 `release/win-unpacked` + `Electron-windows-x64.exe`。和 portable 目录**并存、不同名**，不互删。

`release-portable/` 里旧 zip 是本机垃圾，不进仓；新脚本不再往那里写。旧目录可手工删，腾出数 GB。

---

## 五、关联、冲突、范围

| 关系 | 判断 |
|------|------|
| 金路径 | 只改「怎么拿到文件夹」，不改录→停→编→导 |
| 与步骤 A（已出 zip） | 同一步的形态收紧：目录即终态，zip 改为可选/不做 |
| 与 `asarUnpack` / 采集 ENOENT | **不动**；目录包里仍然要有 `app.asar.unpacked` |
| 与手册 | 打开方式从「解压 zip」变成「打开 `release/recordly-portable-<版本>`」——必须改 `R20260906-01` |
| 真互斥 | 无。需要网传时仍可事后手工压缩该文件夹 |

**不做：** 合并 dist 两套 outDir；启用 builder `portable` 单文件；把旧 zip 提交进仓。
