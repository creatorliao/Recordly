# 最佳实践_Electron应用改造成Portable

> 用途：把已经能 `electron-builder` 打 **NSIS 安装包** 的 Electron 应用，改成对内能 **打开文件夹即跑** 的 Windows 分发；并分清「安装包 / `dir` 目录包 / ZIP / 单文件 portable / asarUnpack」以及 **谁需要额外装软件**。  
> 从 Recordly 2026-09-06 这一轮抽出来：内部软件拦安装器、上游有人把安装 exe 误当成 portable、壁纸打进 extraResources 后打包窗口 404、自动更新会把人带回安装包、本机自用还要再解压 zip。  
> 以后改装别的 Electron 应用，先读这篇，再改那个仓库的 `electron-builder` 配置。

---

## 〇、先钉三件事，再改 builder

1. **谁在用、在哪台机器上用**  
   内网培训机、被 EDR / 软件管家拦截「未备案安装包」→ 优先 **目录包（`dir`）**；只有需要网传时再压 zip。  
   可以走安装向导的机器 → NSIS 可以留作备胎。

2. **成功长什么样**  
   打开名为 `应用-portable-<版本>` 的文件夹 → 双击里面的 exe → 金路径能走完。  
   **不要**再弹出安装向导、不要要求装 Node / CMake / VS、本机自用不要先解压一遍。

3. **失败长什么样**  
   文件夹里没有可双击的 exe（只有一堆资源）；或双击后又去下安装包；或界面裂图 / helper 不工作。

没写这三句就开始改 `win.target`，最后会得到「一个叫 zip 的安装器」或「一个不能跑的资源包」。

---

## 一、三种 Windows 产物，差在哪里

electron-builder 在 Windows 上常见三种，名字容易混。

| 产物 | 命令 / target | 用户看到什么 | 像不像安装器 | 数据默认在哪 |
|------|----------------|--------------|--------------|--------------|
| **NSIS 安装包** | `--win` 且 `win.target: nsis` | 一个大 `.exe` 向导：选目录、快捷方式、写注册表 | **很像**；内网最常拦 | 一般是 `%APPDATA%\<productName>` |
| **目录包 / ZIP** | `--win zip` 或 `dir` 再自己打包 | 文件夹里有 `你的.exe`、`resources\`、dll | **最不像** | 默认仍是 AppData（见 §四） |
| **builder 的 `portable`** | `win.target: portable` | **单个** exe，先自解压到临时目录再跑 | **仍很像** exe 安装器，EDR 常同一套启发式 | 临时目录，关了可能丢 |

不要把下面三个词当成一回事：

| 词 | 是什么 |
|----|--------|
| `win-unpacked` | builder `dir` 打出来的**已经能跑**的文件夹 |
| `app.asar.unpacked` | `asarUnpack`：exe 必须摊在磁盘上，和免不安装无关 |
| builder `portable` | 单文件自解压，很像安装器 |

Recordly 对内策略（可复用）：

- **本机主发：`electron-builder --win dir`**，再把 `win-unpacked` 改名为 `recordly-portable-<version>`  
- **网传可选：** 再手工压这个文件夹  
- **备胎：NSIS 继续能打**，不当日常分发  
- **默认不做** builder 那种单文件 `portable`

上游 Recordly 曾经把「Release 里的安装 exe」说成 portable（Issue #386）——**安装器 ≠ portable**。验收时打开目录，必须能看到可执行文件，而不是只有 `latest.yml`。

本仓对照：

| 脚本 | 实际命令 | 典型产物 |
|------|----------|----------|
| `npm run build:win` | `electron-builder --win`（配置里 target 仍是 nsis） | `release/Electron-windows-x64.exe` 安装向导 |
| `npm run build:win:portable` | 同一套编译，最后 `electron-builder --win dir` | `release/recordly-portable-<version>/`，直接双击 exe |

两条命令前面都要先编前端 + **先编好 native helper**。目录包不会在用户电脑上现编译。

---

## 二、用户要不要额外安装？

分两层，改装任何 Electron 应用都先画这张表。

### 2.1 最终用户（解压即跑的那个人）

**目标：零额外安装。** 不要 CMake、不要 Visual Studio、不要 Node、不要 Python。

他需要的只有：

- Windows（你声明支持的版本）  
- 解压工具（资源管理器自带）  
- 若公司拦 **所有** 未签名 exe，那是白名单问题，换包装解决不了  

应用里的 ffmpeg、C++ helper、壁纸，必须 **打包装机已经放进 zip**。

### 2.2 你（改装 / 打包装机）

**要额外装的是开发工具，不是给用户的清单。**

| 工具 | 干什么 | 不装会怎样 |
|------|--------|------------|
| Node + npm | 跑 Vite、electron-builder | 打不出包 |
| CMake + MSVC | 编仓库里的 C++ helper | 只能带着旧 exe，或功能缺失 |
| 可选：VS Build Tools | 提供 `cl.exe` / `vcvars64.bat` | CMake 空转 |

CMake 的装法、意义、本仓脚本：见同目录 `20260906-02-最佳实践_Windows本机CMake与原生C++编译.md`。  
**不要把那篇的安装步骤写进用户手册。**

### 2.3 一句话口径（可直接贴给同事）

> 给你的是绿色目录：解压后打开 exe。开发同事电脑上才会装 Node / CMake，那是为了重新造这个目录，不是你上课要用的。

---

## 三、把别的 Electron 应用改成 ZIP，按这个顺序

不要一上来改 `app.setPath("userData")`。先能跑，再谈「整包绿色」。

### 步骤 A · 先打出「里面有 exe 的 zip」（P0）

1. 看现有 `electron-builder` 的 `win.target`。若只有 `nsis`，**不要改掉它**，另加一条脚本：

   ```text
   electron-builder --win zip
   ```

   与 ` --win`（走 json 里的 nsis）分开，避免一次构建把两种产物搅乱。

2. 解压产物，确认：

   - 根下或一层子目录里有主程序 exe  
   - 有 `resources/`（asar、extraResources、解包的 native）  
   - 双击能启动  

3. 金路径走一遍。监控是否拦截：**拿这份 zip 里的 exe 测**，不要用安装包的结论代替。

### 步骤 B · 关掉会把人带回安装包的更新（P1）

ZIP 跑起来后，若还在跑 `electron-updater` 且 `publish` 指向 GitHub / 内网的 **NSIS**，用户过两天又会下载「会被拦的安装包」。

做法（三选一，越干净越好）：

- 对内发行关掉更新入口（Recordly 选择：**彻底移除**自动更新）  
- 或：检测到自己不是 NSIS 安装（例如 exe 旁边没有 `Uninstall.exe`）就 disable updater  
- 不要对 ZIP 用户静默下载 `.exe` 安装器  

### 步骤 C · 资源路径按「打包后真实位置」读（常被当成 UI bug）

Electron 打包后，**界面静态资源和 extraResources 不是同一条路径**。

Recordly 壁纸就是这样裂的：

| 层 | 事实 |
|----|------|
| 打包 | `files` 里排除了 `dist/wallpapers`，壁纸改走 `extraResources` → `resources/assets/wallpapers` |
| 窗口 | 打包后用本机 HTTP 读 asar 里的 `dist/` |
| 界面 | 缩略图失败时退回 `/wallpapers/xxx.jpg` → **404 裂图** |

改装别的应用时按这个清单查：

- [ ] 大资源（壁纸、模型、样例视频）是在 asar 里，还是在 `extraResources`？  
- [ ] 渲染进程用的是 `file://`、自定义协议，还是 `http://127.0.0.1` 读 dist？  
- [ ] HTTP 服务有没有把 `/某目录` **映射到 extraResources**？  
- [ ] 失败回退有没有用「开发态才成立」的根路径（如裸 `/wallpapers/`）？  

Recordly 纠正：打包 HTTP 把 `/wallpapers` 指到 `getAssetRootPath()/wallpapers`；`getAssetRootPath` 在 packaged 下先看 `process.resourcesPath/assets`，再试 exe 旁 `resources/assets`。ZIP / 安装包布局略有差别时，**多候选路径**比写死一条更稳。

### 步骤 D · native 模块与 helper 必须预置（P0，和 A 绑在一起）

ZIP 不是源码树。用户机器没有 `node-gyp`。

| 类型 | 打包时注意 |
|------|------------|
| `*.node`（如 uiohook） | `asarUnpack`；打包装机要 `electron-rebuild` 过。打包后仍可能加载失败，要有退路 |
| 独立 exe helper | CMake 在打包装机编好，放进 `asarUnpack` 或 extraResources；spawn 时 `cwd = dirname(exe)` |
| ffmpeg-static 等 | 同样 unpack，不要指望 asar 里能直接 exec |

Recordly：打包后 uiohook 常失败 → 点击遥测断了。退路是 C++ `cursor-monitor` 自己报按下/抬起，算法在没有 click 时还能用停留启发式。  
**改装启示：** 每个关键 native 都问「它挂了以后，金路径是否还有一条不依赖它的路？」

### 步骤 E · 数据跟不跟 exe 走（P2，默认先不做）

只完成 A～D，得到的是 **免安装启动**，还不是 U 盘整包绿色。

几乎所有 Electron 应用默认：

```text
userData = %APPDATA%\<productName>
```

项目、设置、下载的模型都在这里。换电脑、换目录，**程序在、数据不在**。这通常可接受。

只有出现「必须把课和模型跟着文件夹走」时，再在 `app.ready` **之前**检测 exe 旁的 `portable.ini` 或 `data/`，有则 `app.setPath("userData", ...)`。  
**默认不要自动搬家。** 没有标记文件 = 和今天一样写 AppData，避免「两个脑子」。

---

## 四、安装包和现在的 Portable，对 Recordly（例）差在哪

用本仓已经做完的事实对照，方便你给别人讲。

| 维度 | NSIS（`build:win`） | ZIP Portable（`build:win:portable`） |
|------|---------------------|--------------------------------------|
| 拿到手 | 一个安装向导 exe | 一个 zip，解开是目录 |
| 启动 | 装完开始菜单 / 桌面快捷方式 | 进目录双击 `electron.exe`（本仓 `executableName`） |
| 内部拦截 | 你已定性为经常拦 | 要真机对照；形态上不像安装器 |
| 卸载 | 有卸载项 | 删文件夹即可（AppData 里的数据还在） |
| 自动更新 | 曾走 GitHub 再下安装包；本仓已整段移除 | 同样不再下安装包 |
| 壁纸 / helper | 同一套 extraResources + bin；路径 bug 两种包都会中 | 已按 §三.C / D 修 |
| 用户额外部署 | 无（但过不了拦截就等于没有应用） | 无（解压即可） |
| 开发额外部署 | 打包装机要 Node +（若改 C++）CMake/MSVC | 相同 |

**没变的部分（故意）：** 录→停→编→导；userData 仍在 AppData；身份仍是 Electron。  
Portable 改的是 **怎么把能跑的程序交到手上**，不是另做一款产品。

---

## 五、检查表（每改装一个 Electron 应用打一遍）

产品

- [ ] 写清角色、金路径、为什么不能用安装包  
- [ ] 对内主发 ZIP，NSIS 是否只留备胎  

构建

- [ ] 独立脚本打 `--win zip`，不解绑现有 nsis  
- [ ] 解压后能看到主 exe，且能启动  
- [ ] native helper / ffmpeg / 大资源都在包内  
- [ ] 打包装机已编过 C++（见 CMake 那篇），用户机零编译  

运行

- [ ] 没有自动更新把人带回 NSIS  
- [ ] extraResources 的资源在打包窗口能显示（不要只在 `npm run dev` 看过）  
- [ ] helper 的 `cwd`、asarUnpack 已核对  
- [ ] 尚未做 userData 旁路时，手册写明「设置和项目还在 AppData」  

验收

- [ ] 内网拦不拦：安装包一份、zip 内 exe 一份，分开记  
- [ ] 两种都拦 → 走白名单，不要再换一种 exe 包装幻想过关  
- [ ] 打开方式变了就改使用手册（解压 → 进目录 → 打开 exe）

---

## 六、常见误判

| 误判 | 实际 |
|------|------|
| 「打出 zip 就是 portable」 | zip 里可能没有 exe，或只是源码/符号包 |
| 「builder 的 portable 更绿色」 | 单文件自解压，监控往往当安装器 |
| 「用户要先装 Electron / Node」 | 包里已经带了运行时 |
| 「用户要先装 CMake」 | 只有重新编译 helper 的人要 |
| 「开发态资源正常，打包一定正常」 | extraResources vs dist HTTP 是两条路 |
| 「改了安装目录选项 = portable」 | 那只是 NSIS 能选盘符，仍是安装器 |
| 「ZIP 会自动带走所有数据」 | 默认不会；那是步骤 E |

---

## 七、这一轮操作如何映射到改装步骤（备查）

便于你以后讲「我们 Recodly 已经做过一遍」。

| 当时做的事 | 落在哪一步 | 别的应用怎么复用 |
|------------|------------|------------------|
| 增加 `build:win:portable`（`--win zip`） | 步骤 A | 原样加脚本 |
| 删除 GitHub 自动更新 | 步骤 B | 至少对 ZIP 禁用 updater |
| 壁纸 HTTP 映射 extraResources、资产多路径、缩略图不回退裸路径 | 步骤 C | 查自己的大资源 |
| 自动装 CMake、NMake 退路、重编 `cursor-monitor` 进 bin | 步骤 D + CMake 专篇 | 每个 C++ helper 抄流程 |
| 界面默认简中、语言列表只留中英 | 产品范围，不是 portable 必做 | 按你的语言尺子另改 |

项目内专题（过程细节、验收项）：

- `docs/01-Projects/R20260906-04-Recordly改造成Portable版本/`  
- 执行留痕：`docs/01-Projects/R20260906-02-Recordly官方仓库PR与Issue调查分析/09-执行留痕.md` 变更 10～13  

Areas 只保留 **可换仓库复用的做法**；某个产品的 PR 号、金路径清单仍放在 01-Projects。
