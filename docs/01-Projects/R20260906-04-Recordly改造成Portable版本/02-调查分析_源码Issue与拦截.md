# 02 · 调查分析：源码、上游 Issue、拦截

> 调查日：2026-09-06。结论服务「值不值得做、先改哪」。不改代码。

---

## 一、上游 Issue / PR（相关都保留）

| 编号 | 状态 | 要点 | 对本仓 |
|------|------|------|--------|
| **#886** | open | 只要 portable，不安装 | 对内刚需 |
| **#386** | closed，**没做成** | 要 Windows 解压即跑 ZIP；维护者把安装 exe 当成 portable | 不要重蹈：安装器 ≠ portable |
| **#706** | open | 装到非系统盘 | 本仓 NSIS 已 `allowToChangeInstallationDirectory: true`；真缺口仍是免安装 |
| **#883** | PR 已合（上游） | Windows 安装向导 | **互补**：别人也许要安装包；我们主发 ZIP |
| 专门做 extract-and-run 的干净小 PR | **未检索到** | — | 本地改 builder + 路径，不代合上游 |

Linux AppImage（#818 等）仍出范围。

---

## 二、本仓构建现状

| 项 | 事实 |
|----|------|
| 配置 | `electron-builder.json5` |
| `win.target` | **只有 `nsis`** |
| 产物名 | `${productName}-windows-${arch}.${ext}` → 现为 `Electron-windows-x64.exe` |
| 身份 | `appId=com.electron.app`，`productName` / `executableName` = Electron（`a2e32fa1`） |
| 脚本 | `npm run build:win` → `electron-builder --win` |
| CI | `.github/workflows` 里 Windows 也是 `dir nsis`，**没有**给用户的 win zip 主产物 |
| 自动更新 | `electron/updater.ts` 用 `electron-updater`；安装包生态。ZIP 目录跑起来时更新通道往往无效或乱下安装包 |

**缺口：** 没有「解压后双击就能用」的官方产物形态。#386 抱怨的「Release 里 zip 没有可跑 exe」在本仓同样成立——我们根本没打这种包。

---

## 三、运行时路径（portable 第二步才动）

几乎所有持久数据挂在 `app.getPath("userData")`（打包后一般是 `%APPDATA%\Electron`）：

| 用途 | 位置（源码） |
|------|----------------|
| 录像目录默认 | `electron/appPaths.ts` → `USER_DATA_PATH/recordings` |
| 项目最近打开、快捷键、录制设置、倒计时、应用设置 | `electron/ipc/constants.ts` 多个 `*.json` |
| Whisper 小模型 | `userData/whisper/ggml-small.bin` |
| 更新日志 | `userData/updater.log` |
| 原生工具缓存 | `userData/native-tools/…` |
| 壁纸缩略图 | `register/assets.ts` 写 userData |
| 开发态 | `VITE_DEV_SERVER_URL` 时改到 `Recordly-dev` |

导出临时文件走 `app.getPath("temp")`（系统临时目录），U 盘只读时仍可能失败——第一步不管，记风险。

**含义：** 只改 builder 打出 ZIP，**应用能开、课能录**，但换电脑/拔 U 盘**不会**带走项目和模型。这叫「免安装启动」，还不是「整包绿色」。N6 接受这一点；N7 另做。

---

## 四、三种产物与拦截（综合考量）

内部软件拦安装包，已由你定性为**每次发生**，不是偶发。身份改名只覆盖「未备案厂商」。

| 产物 | 形态 | 像不像安装器 | 建议 |
|------|------|----------------|------|
| NSIS | 向导、写目录、快捷方式、常提权 | **很像**；你已每次被拦 | 对内不主发；流水线可留着 |
| electron-builder `portable` 单文件 | 自解压 exe → 临时目录再跑 | **仍很像**，EDR 常同一套启发式 | **不当默认** |
| **`dir` + ZIP** | 文件夹内 `electron.exe` + 资源 | 最不像安装 | **对内主发** |

若监控拦的是「所有未知 exe」，换包装也没用 → 真机 **T12** 对 **T3**。两种都拦就走白名单，不是再换格式。

---

## 五、关联与冲突

| 关系 | 说明 |
|------|------|
| 与金路径 | 只影响「怎么拿到能跑的程序」，不改录→编→导顺序 |
| 与轨道 B | 同一条「能装能跑」；本夹是专题拆开写 |
| 与自动更新 | ZIP 下应 **默认关掉或忽略** 官方安装包更新，避免又下一份会被拦的 NSIS |
| 与手册 | 打开方式变了，做完必须改 `R20260906-01` |
| 与 #706 | 改安装目录 ≠ portable；先核验现 NSIS，不单开 |

**真互斥：** 无。NSIS 与 ZIP 可同时打。发布策略是「主发谁」，不是「删谁」。

---

## 六、风险（做之前要看见）

1. ZIP 体积大（现安装包约 177MB 量级，目录包通常更大）。  
2. 路径含中文/空格/OneDrive 导致原生 helper 失败。  
3. 解压到「同步盘 + 杀毒实时扫描」启动慢或文件锁。  
4. 无开始菜单，同事找不到 exe。  
5. `electron-updater` 若仍指向 GitHub 安装包，会把人带回拦截。  
6. 第二步把 userData 放到 exe 旁：U 盘只读、权限、多开实例抢同一数据目录。
