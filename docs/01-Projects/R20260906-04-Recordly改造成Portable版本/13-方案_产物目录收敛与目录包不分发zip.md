# 13 · 方案：产物目录收敛 + portable 只出文件夹

> 承接 [`12-调查_构建产物目录与preload.md`](12-调查_构建产物目录与preload.md)。  
> 服务 G1（拿得到能跑的程序）与 G4（少而稳）。不改金路径交互。

---

## 一、拍板（本轮就按这个做）

| # | 决定 | 理由 |
|---|------|------|
| 1 | **不提交**根目录 `preload.mjs`；加入 `.gitignore` 并删除漏网文件 | 构建垃圾；真源是 `electron/preload.ts` |
| 2 | **不合并** `dist` 与 `dist-electron` | 两套 Vite 产物；改路径碰启动，收益只是少一个文件夹 |
| 3 | **合并分发目录到 `release/`** | 不再用 `release-portable/` |
| 4 | portable 打 **`dir`，不打 zip** | 文件夹名：`release/recordly-portable-<package.json 版本>`，与过去解压后一致 |
| 5 | **不启用** electron-builder 的 `portable` 单文件目标 | 仍像安装器；`03` 步骤 D 维持不做 |
| 6 | NSIS 仍可打到 `release/`（`win-unpacked` + 安装 exe） | 与 portable 目录不同名共存 |

---

## 二、目标目录长什么样

```text
dist/                  ← 前端（保持）
dist-electron/         ← main.cjs + preload.mjs（保持）
release/
  win-unpacked/                    ← 仅 NSIS 流水线中间物（可选存在）
  Electron-windows-x64.exe         ← 仅打安装包时才有
  recordly-portable-1.4.0-beta.10/ ← 日常：直接双击其中 electron.exe
  .portable-staging/               ← 构建瞬间，打完删除
```

同事/自己用：打开 `release/recordly-portable-<版本>/`，双击 `electron.exe`。不必再解压。

---

## 三、改哪些文件（面小）

| 文件 | 改法 |
|------|------|
| `.gitignore` | 增加 `/preload.mjs` |
| `scripts/build-win-portable.mjs` | `--win dir`；输出 staging；改名为 `release/recordly-portable-<version>`；不写 zip |
| `scripts/smoke-packaged-binaries.mjs` | 继续扫 `release/`；旧 `release-portable/` 仅兼容历史目录 |
| `R20260906-01` 教程 / 速查卡 | 变更提示：不再「先解压 zip」 |
| Areas `20260906-03` | 主发从 zip 改为 dir 目录包 |

不改：`electron-builder.json5` 的 `asarUnpack`、`win.target` 默认 nsis（portable 仍用命令行覆盖 target）、`vite.config.ts` 的 outDir。

---

## 四、闸门与平衡

| 问 | 答 |
|----|----|
| 服务哪个 G | G1 分发可用；G4 少一份 680MB 重复压缩 |
| 不过度设计？ | 只改打包脚本与忽略规则 |
| 回归？ | 目录布局与现解压结果相同；asarUnpack 不变 |
| 用户有必要吗？ | 每次解压是真痛点 |
| 会困惑吗？ | 手册写清：文件夹名没变，少了 zip 这一步 |
| 奇怪影响？ | 正在运行旧目录时覆盖会失败，脚本要说「先关 Electron」 |
| 习惯对齐？ | 资源管理器打开文件夹双击 exe，比先解压更接近日常 |

S 约：R4 C4 E5 → **4.25**，低垂，脚本级，AI 可做。

---

## 五、验收

1. 根目录不应再出现未忽略的 `preload.mjs`。  
2. `npm run build:win:portable` 结束后，`release/recordly-portable-<当前版本>/electron.exe` 存在，**同目录没有新 zip**。  
3. `release-portable/` 不再被脚本写入。  
4. 该目录下仍有 `resources/app.asar.unpacked`（helper / ffmpeg）。  
5. 录→停→编→导与解压旧 zip 的用法相同。

真机：若目录正在被自己占用，应看到明确失败而不是半截目录。
