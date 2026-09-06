# 03 · 方案：设置开关 + 右键多动词（真源）

> 抄 VS Code 的**注册表形状**和「卸载删键」。  
> 不抄：安装器当唯一开关、永远单动词、Win11 DLL、整份 `code.iss`。  
> 两间房行为跟 `R20260906-14`；本夹只多一条「从资源管理器进门」。

---

## 一、信息架构（用户看见什么）

设置（常规 / Windows 集成）主开关：

**在资源管理器右键菜单中显示 Recordly**（默认：**开**，培训师少一步；可关）

打开后，文件 / 文件夹 / 文件夹空白处出现**一级「Recordly」**，右侧级联（少占根菜单，对齐 7-Zip）：

```
Recordly ▶
  开始录制
  打开录制工具栏
  用 Recordly 打开
```

英文：

```
Recordly ▶
  Start recording
  Open recording toolbar
  Open with Recordly
```

| 项 | 用户意图 | 进程行为 | CLI |
|----|----------|----------|-----|
| 开始录制 | 马上进金路径第一步 | 显示录制工具栏，按设置倒计时后**开录**；采集源 = 上次源（无则默认显示器）；麦 = 上次麦 | `--record` + 可选 `--path` |
| 打开录制工具栏 | 打开对应窗口（录制那一间），先选源 | 只拉工具栏，**不开录** | `--hud` + 可选 `--path` |
| 用 Recordly 打开 | 打开对应窗口（编辑器那一间） | 带路径进编辑器 | `--open` + 路径 |

第一期不在设置里拆「只显示其中某几项」。要减项就关总开关。避免设置里再套三个勾（G4）。

盘符右键：第一期**不做**（课在文件夹里，少一条脏菜单）。VS Code 有 Drive，我们不跟。

---

## 二、路径怎么用（采集源不是路径）

资源管理器只能给 `%1` / `%V`。录屏的采集对象是显示器 / 窗口 / 区域，**不能**从「对着文件夹右键」推断「录哪个软件」。

| 右键对象 | `--path` | 开录 / 开工具栏 | 用 Recordly 打开 |
|----------|----------|-----------------|------------------|
| `*.recordly` | 该文件 | 工具栏；保存/追加到该项目（已开项目则聚焦；`--record` 走 14 的「编辑中可继续录」若已落地，否则新片段进该项目） | 编辑器打开该项目 |
| 常见视频 | 该文件 | 不当成采集源；开录仍用上次屏幕源；`--path` 只作默认导出/项目旁路，可忽略 | 已有「打开视频」 |
| 文件夹 / 空白处 | 该目录 | 默认项目/保存位置 = 该目录 | 夹内最近 `.recordly`，否则空态 + 该目录 |

已在录制中再点「开始录制」：聚焦工具栏，**不开第二路**。  
已开编辑器再点「打开录制工具栏」：切到工具栏，不关编辑器（14 的两间房互切）。  
已开实例：一律 `second-instance` 转发 argv。

倒计时、系统声、摄像头：**全部跟现有设置**，右键不另做一套。

---

## 三、设置如何让菜单出现（HKCU，进程内写）

权威源是应用设置，不是安装脚本。

打开开关 → 主进程写下面三组键（每组一个级联根 + 三个子命令）。关掉 / 卸载 → 整键删除。

级联写法（经典 `shell`，无需 DLL）：

```
HKCU\Software\Classes\*\shell\Recordly
  (default) = Recordly
  Icon      = "{exe}"
  SubCommands =   （空值：使用本键下的 shell 子命令）

HKCU\Software\Classes\*\shell\Recordly\shell\record
  (default) = 开始录制
  Icon      = "{exe}"
  \command  = "\"{exe}\" --record --path \"%1\""

…\shell\hud\command     = "\"{exe}\" --hud --path \"%1\""
…\shell\open\command    = "\"{exe}\" --open \"%1\""
```

文件夹与空白处把 `%1` 换成 `%V`，根键分别为：

- `Software\Classes\directory\shell\Recordly`
- `Software\Classes\directory\background\shell\Recordly`

`SubCommands` 空字符串 + 同键 `shell\...` 是 Windows 级联的常规写法（7-Zip 同类）。若某台机器空 `SubCommands` 不展开，改用 `ExtendedSubCommandsKey` 指到 `Software\Classes\Recordly.ContextMenu`（实施时以真机为准，写进留痕）。

语言：写键时按当前 UI 语言填默认名；切换语言时若开关为开，**重写**显示名。

Portable：`{exe}` = `process.execPath`。换盘后再打开开关覆盖 command。

安装器（NSIS `customInstall`）：**可以不写菜单**，只保证卸装时 `DeleteRegKey` 这三棵。菜单首次由应用启动读设置写入（默认开则第一次 `whenReady` 写）。这样 Portable / 安装版同一条代码。

---

## 四、进程内 CLI（Electron）

```ts
type LaunchVerb = "open" | "hud" | "record";

type LaunchRequest = {
  verb: LaunchVerb;
  path?: string;
};

function parseLaunchRequest(argv: string[]): LaunchRequest | null {
  // 跳过 electron / --inspect 等；认 --record --hud --open [--path p] 或裸路径
  // 裸路径且无动词 → verb=open（双击关联、别人只传了文件）
}
```

- `app.whenReady`：解析 `process.argv`，执行一次。无请求则走 14 的「启动时打开」默认房。  
- `second-instance`：解析新 argv，执行动词并 `show` 对应窗。  
- `openPathInApp` / `showHud` / `startRecordingFromCli` 落在现有 IPC 上，不新开采集后端。

施工文件（确认后）：设置项 + 写删注册表模块、`electron/main.ts` argv、设置面板一行开关。改操作 → 手册补「资源管理器右键三条」。

现有缺口：`second-instance` 只拉窗；无 CLI 动词；设置里无 Windows 集成；`nsis` 无卸装删键。

---

## 五、通用客户端（别的内部 exe）

只复用「设置开关写 HKCU 级联 + 卸载删键 + 单实例 argv」。动词表换成该产品的（例如只要 `--open`）。不要把 `--record` 写进通用模板当必选项。

---

## 六、七问

① G1/G2/G4：少摩擦进录、习惯对齐资源管理器。  
② 不过度：三条动词 + 一级级联；不抄 COM DLL；不在右键做导出/字幕。  
③ 回归：卸装/关开关必须删键；单实例避免双采集。  
④ 培训师需要：课文件夹就在资源管理器。  
⑤ 老用户：关开关 = 和今天一样没有右键项。  
⑥ 副作用：默认开会在资源管理器多一级「Recordly」；可关。开录用上次源，须在手册写清「不是录这个文件夹里的软件」。  
⑦ 级联像 7-Zip；「打开」像 VS Code；「关窗/开房」仍跟 14，不发明第三间房。

---

## 七、代决（等确认，可改）

| ID | 代决 | 若推翻 |
|----|------|--------|
| D15-1 | 设置默认**开**右键菜单 | 改默认关，安装后再勾 |
| D15-2 | 三条都在级联里，设置不拆分项 | 只要「开录 + 打开」两条 |
| D15-3 | 开录用上次采集源，路径只当课目录 | 开录先强迫弹出选源（那就和「打开工具栏」重复） |
| D15-4 | 不做盘符、不做 Win11 外层 DLL | — |
| D15-5 | 安装器不写菜单，只保证卸装删键；应用按设置写 HKCU | 安装器同时写一份，易和设置打架 |

---

## 八、等确认

未听到「开始做」不改产品代码。本夹与 `R20260906-14` 并行：14 定两间房和倒计时；15 定进门。若 14 的「启动时打开 / 编辑中追加」未落地，`--record` 先做到「拉起今日 HUD 并点现有开始录制」。
