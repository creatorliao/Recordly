# 16 · 分析：OpenScreen 图标 / 笔记 / 竖条 / 截图隐藏

> 对照：`D:\code\openscreen` 只读。本仓 `LaunchWindow.tsx` / `LaunchWindow.module.css` / `HudIcons` 不存在（图标散在 Phosphor）。  
> 原则：`AGENTS.md` §二（不过度、低风险、习惯对齐）+ 已定 R-HUD（不抄皮、语言不上条）。  
> **只分析。建议进 [`17`](17-方案_第二轮可移植点.md)。**

上一稿 [`05`](05-分析_OpenScreen控制栏与整合建议.md) 看的是密度和分组。本页补图标变换、笔记定性、竖条代价、截图「自动藏」的真正实现。

---

## 1. 先分清两根「魔杖」

| 名字 | 在哪 | 是什么 |
|------|------|--------|
| 口头「魔杖」 | 桌面底部浮条（HUD） | OpenScreen 的录制控制栏 |
| 时间轴 Magic Wand | 编辑器时间轴工具条 | **自动增强 / 自动缩放**（`Wand2`），和打开编辑器无关 |
| 本仓条上魔杖 | `LaunchWindow` 未录态 | P03 用 `MagicWandIcon` 当「打开编辑器」——**借错了字形** |

打开 Studio 的真图标在 `openscreen/src/components/launch/HudIcons.tsx` 的 `OpenInEditorIcon`：线描**拍板**（斜纹拍子 + 下方矩形），不是星星魔杖。中文 tooltip：「打开工作室」。录中不渲染。

本仓已有同位按钮（录制键右侧、录中隐藏、`switchToEditor`），差的是字形和语义：魔杖在两边都表示「自动变好看」，拿来当「进剪辑间」会教错。

---

## 2. 图标体系与变换（值得学的）

OpenScreen 把「条上最显眼的几个」写成同一套 20px / `strokeWidth: 1.6` 自定义 SVG（`HUD_SVG_PROPS`），不用最近的 lucide 凑合。变换全是**同一字形改状态**，不加第二颗钮：

| 控件 | 空闲 | 开 / 录中 |
|------|------|-----------|
| 录制 `RecordGlyph` | 实心圆 `r=7.5` | 圆角方块 11×11 |
| 录制键外壳 | 透明 34×34 | 展开 `min-w:78` + `mm:ss` |
| 系统声 | 喇叭 + 波纹 | 静音斜杠；开态描成强调色 |
| 麦 | 胶囊麦 | 斜杠；开态强调色 |
| 摄像头 | 机身+镜头 | 斜杠；开态强调色 |
| 横竖 | 画出**另一方向**的条（提示「点了会变成这样」） | `aria-pressed` |
| 打开编辑器 | 拍板 | **整颗卸掉**（不是灰掉） |

分组靠分隔线 + 靠近，没有「Screen 1」灰底胶囊。开态用翠绿 `#10b981`（他们的品牌色）。每颗控件 `memo`，避免计时每秒重绘整条。

本仓对照：

| 点 | OpenScreen | 本仓现在 |
|----|------------|----------|
| 打开编辑器字形 | 拍板 | Phosphor `MagicWandIcon` 18 |
| 录制键 | 透明底 + 红字形 34；hover 淡红底 | **整颗实心 `#f43f5e` 圆** + hover `box-shadow: 0 0 0 6px` 光晕 |
| 录中计时 | 长在录制键上 | 另开 `RecordingControls`：REC 字 + 独立计时 + 仍是实心红停录圆 |
| 麦/摄/声 | 自定义线标 + 斜杠 | Phosphor 成对图标（Microphone / MicrophoneSlash） |
| 横竖 | 有 | 无 |
| 皮 | 固定深色 `#14171c` | 跟随主题（已定 D16，保持） |

尺寸上 P03 已经把录制键收成 **34**（`09` 变更 8）。你觉得「圆圈太大太显眼」，主因不是 34，而是**整颗被涂红 + 外发光**，在浅色条上比旁边 ghost 图标抢一层。OpenScreen 的红只在 15px 直径的字形上。

---

## 3. 选源 → 再录 → 停录进编辑器

### 3.1 选源（R5）

OpenScreen `handleRecordButtonClick`：

1. 没源且未在录 → `recordAfterSourceSelectionRef = true`，打开选源窗
2. `onSelectedSourceChanged` 且 flag 仍在 → **自动 `toggleRecording()`**
3. 选源窗关掉且没选 → 清 flag，不录

文档原话：*If no source is selected when you hit record, OpenScreen opens the picker first and starts recording automatically once you choose one.*

本仓：没源点录制会 `requestOpen("sources")`（先选），但 `handleSourceSelect` **只记下源，不开录**。培训师要再点一次红圆。这是和 OpenScreen 差的那一拍，也是你说「这之前先选择对应的源」里还没对齐的部分。

Linux 两边都走系统 portal，本仓只做 Windows，不必抄 portal 分支。

### 3.2 停录进编辑器（R4）

两边都是：停录 → 收尾写当前视频/会话 → `switchToEditor()`。  
本仓 `useScreenRecorder.finalizeRecordingSession` 已做；[`14`](14-问题_录制条打开编辑器空态与条上空白.md) §4.4 明确「不改停录自动进编辑器」。**不要当新功能重做。**

---

## 4. 笔记：提词器，不是旁白

源码：

- `NotesWindow.tsx` + `NotesToolbar.tsx` + `notesTeleprompter.ts`
- `electron/windows.ts` `createNotesWindow()`：400×540、alwaysOnTop、`setContentProtection(true)`
- 入口：`?showNotes=true`；条上 `HudNotesButton`（`NotepadText`）；Linux HUD 不放
- 编辑器：Tiptap `StarterKit`（加粗/列表/引用）
- 提词：`requestAnimationFrame` 按速度滚；播时锁编辑（避免光标把滚动顶回去）；镜像时也锁编辑
- 持久化：`localStorage.notes` + `notesTeleprompterSettings`

对培训师：录操作课时把讲稿开在旁边、需要时自动往下滚。**不进成片。**

本仓：无笔记窗、无 Tiptap 依赖、无旁白轨。时间轴可以另加音频，但那是 N5 门外的另一件事。

代价：新 `BrowserWindow` + 内容保护 + i18n + 一套提词逻辑。完整抄（含 Tiptap + 镜像）容易过 500 行。可拆：先纯文本窗，再提词。

[`05`](05-分析_OpenScreen控制栏与整合建议.md) 把笔记标成 X2「本轮不借」。本周你点名要认真分析，故从「不借」改回「可选，另包」，不是自动开工。

---

## 5. 竖条

OpenScreen：

- `userPreferences.trayLayout`: `horizontal` | `vertical`，默认横
- 条上 `HudTrayLayoutButton` + `OrientationIcon`
- CSS：`.hudBarVertical { flex-direction: column; padding: 9px 7px; max-height: var(--hud-bar-max-h); overflow-y: auto }`
- 竖着时源名 `sr-only`（只留显示器图标）；分隔线换向
- `hudGeometry.ts`：**预留**浮层尺寸，避免竖条变高时原生窗狂 resize

本仓 HUD 仍是「量到多少申请多少」的发现式尺寸，竖条会碰到窗口高度、点击穿透、拖动手柄、popover 锚点。这是 P2 的真正成本，不是转个 `flex-col`。

培训师价值：录屏幕下沿 / 任务栏附近时，横条挡操作。默认必须仍是横条（习惯）。

---

## 6. 「启动截图软件，工具栏会藏」——不是监控截图进程

OpenScreen **没有**枚举 Snipping Tool / 微信 / QQ。它做的是：

```text
BrowserWindow.setContentProtection(true)
  → Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
  → 该窗不出现在 WGC / 现代截图预览里
```

注释写在 `openscreen/electron/windows.ts` 19–26 行：HUD 和笔记窗从所有屏幕/窗口采集里排除，所以控制条不会烤进录像。副作用：自动化截图也看不见这条，所以他们留了测试用环境变量关掉保护。

Win+Shift+S、系统截图工具走的是同一路采集。预览里条「没了」，看起来像自动隐藏。部分始终置顶窗还会被系统截图层挤到后面——那是系统行为，不是他们写了「若启动截图则 hide()」。

本仓**已经有**：

- `electron/windows.ts` `hud.setContentProtection(enabled)`
- 默认开（`hideHudFromCapture = true`）
- 三点菜单可关（「从录像中隐藏控制条」）
- 只作用于 HUD，没有笔记窗可保护

和 OpenScreen 的差：他们默认死开（测试才能关）；我们给了开关（更符合「可关」）。微信/QQ 老截图若走 GDI `BitBlt`，**两边都可能仍能截到条**——这不是漏了进程检测。

不要学：按进程名藏条（脆弱、过度、有误伤）。

可补：若做笔记窗，笔记窗也要 `setContentProtection`；hide/show 后再断言一次保护（本仓已有 `reassertHudOverlayCaptureProtection`）。

---

## 7. 和本仓原则怎么卡

| 项 | 落 G？ | 不过度？ | 回归？ | 用户真要？ | 会困惑吗？ | 怪副作用？ | 习惯？ |
|----|--------|----------|--------|------------|------------|------------|--------|
| 拍板替换魔杖 | G4 | 是，<30 行 | 低 | 你已点名 | 更不易混成「自动增强」 | 无 | 拍板=进工作室，常见 |
| 录制键改透明红点 | G4 | 是，CSS+一枚 SVG | 中（停录键也要用同一套） | 你已点名太显眼 | 仍是红=录 | 浅色条上红点比红球弱，要保证找得到 | OBS/Camtasia 也是小红点不是大红盘 |
| 选源后自动开录 | G1/G2 | 是，一面旗 | 中（取消选源必须不录） | 「先选源」 | 少点一次，符合预期 | 误选窗口会立刻录——和 OpenScreen 一样，可用倒计时兜 | OBS 也是选源再开始；开始后才录 |
| 停录进编辑器 | G1 | 已有 | — | 已有 | — | — | 录完进剪辑 |
| 截图藏条 | G1 | 已有 | — | 已有 | 三点里能关 | 关了会进成片 | 控制条不进片是录屏软件默认 |
| 笔记提词器 | G2 弱 / G4 紧 | 完整抄偏大 | 新窗+置顶 | 你想移植 | 条上再多一颗 | 挡画面；不是旁白 | 提词器是可选附件 |
| 竖条 | G4 | 几何有风险 | 高（穿透/拖/尺寸） | 有用 | 默认横则不困惑 | 竖条 popover 方向 | 默认可关 |

闸门：换引擎 / >2000 行 / 语言上条 / 固定深色皮 —— 仍不做。
