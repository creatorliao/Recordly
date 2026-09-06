# 13 · Windows 构建与环境复盘

> 对应诉求 R18–R20。依据：`dev-creator` 已有提交 + `package.json` / `electron-builder.json5`。  
> PI 当场踩坑的助手回复未随提示词导出，下文**不编造未记录的报错原文**；只写能从仓库核实的事实与下次最短路径。
>
> **本篇不代替一次成功安装核验。** 安装包能否双击、会不会被拦截，等你说「开始做轨道 B」再在本机跑。

---

## 一、已经做成的事

| 项 | 证据 | 说明 |
|----|------|------|
| 工作分支 | `git branch` = `dev-creator` | 后续移植都在这支，不要另开平行分支 |
| Electron 默认身份 | `a2e32fa1` | `package.json`：`name` / `productName` / `author.name` = Electron；`electron-builder.json5`：`appId=com.electron.app`、`productName=Electron`、`win.executableName=electron`、NSIS 快捷名 Electron、`signAndEditExecutable=false` |
| 构建产物不把 whisper DLL 误提交 | `2fe3c40b` | `.gitignore` 忽略已 staged 的 whisper runtime DLL |
| 低垂果实（轨道 A） | `10596ded` | 与构建无关，记在同一分支时间线上 |

任务管理器 / 安装信息里应看到通用 Electron，而不是未备案厂商名——这是为了躲开内部按供应商/进程名拦截。

**副作用（已接受）**：关于页、窗口标题、安装目录看起来像「普通 Electron」；`appId` 与官方包不同，可能和官方安装并列成两个应用。只留在 `dev-creator`，不回灌上游身份假设。

---

## 二、从提交能看出的坑与解法

| 困难 | 怎么处理的 | 下次怎么避免 |
|------|------------|--------------|
| 内部监控拦截非备案厂商应用 | 把包装身份改成 Electron 默认（`a2e32fa1`） | 不要把 `productName` / `author` / `executableName` 改回 Recordly 官方名再打包给这台机器用 |
| whisper 运行时 DLL 被 stage 进仓库 | `.gitignore`（`2fe3c40b`） | 构建后先 `git status`，二进制 runtime 不要提交 |
| 官方包会带厂商元数据 | 只在本分支改 builder 配置 | 从 upstream rebase 时盯 `package.json`、`electron-builder.json5`，避免被盖回去 |

---

## 三、下次快速重建（最短命令）

在仓库根、分支 `dev-creator`：

```bash
# 1. 国内源（按你的环境选用）
npm config set registry https://registry.npmmirror.com

# 2. 装依赖（首次或 lock 变了才需要）
npm ci
# 若 npm ci 因 lock 对不上失败，再用 npm install

# 3. 开发态冒烟（可选）
npm run dev

# 4. 打 Windows 安装包
npm run build:win
```

产物目录：`release/`，NSIS 文件名形如 `Electron-windows-<arch>.exe`（见 `artifactName`）。

验收：

1. 安装过程 / 任务管理器进程名为 Electron 一类，无未备案厂商串。
2. 能启动，走金路径：选窗口 → 录 → 停 → 编 → 导出。
3. 不被本机监控拦掉。

---

## 四、构建时不要做的事

- 不要跑 `build:mac` / `build:linux`（超出范围）。
- 不要为了「看起来更像 Recordly」改回官方 `appId` / 厂商名（会回到拦截问题）。
- 不要把 `release/`、whisper 二进制提交进 git。
- 不要用 `gh pr merge` 把本分支身份改动推给官方。

---

## 五、待核验（构建已跑通，剩余人工）

- [x] `npm run build:win` 在本机完整跑通（2026-09-06，产物 `release/Electron-windows-x64.exe`，~177MB，NSIS + signtool 均完成，退出码 0）
- [ ] 得到的 installer 能安装、能启动（待真机）
- [ ] 监控不拦截（待真机）
- [ ] 金路径冒烟通过（待真机，见 `16` A-B + A-G）
- [ ] 若 rebase 上游后身份字段被盖回，再补一刀并留痕到 `09`

核验时把新坑追加到本文 §二，不要另开主题夹。
