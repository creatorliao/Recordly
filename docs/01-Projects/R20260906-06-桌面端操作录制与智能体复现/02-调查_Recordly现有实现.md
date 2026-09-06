# 调查：Recordly 现有「鼠标录制」是什么

结论先说：**Recordly 记的是「给成片画光标 / 自动缩放用的遥测」，不是「给 AI 复现操作用的操作序列」。**  
AI 能从中猜「大概在画面哪里点过」，**不能**稳定还原「点了哪个按钮、键入了什么、窗口是谁」。

## 一、它要解决的问题

培训师录屏时，希望成片里：

- 光标轨迹平滑、可换皮肤；
- 点击处有涟漪 / 弹跳；
- Studio 能按点击位置自动加缩放块。

所以系统只要知道：**相对画面的归一化坐标 + 时间 + 点击种类 + 光标形状**。  
它不需要控件名、键盘文本、无障碍树、窗口 HWND。

## 二、实现链路（Windows）

```text
用户开始录制
    ├─ ffmpeg / WGC 抓画面（屏幕或窗口）
    ├─ Electron 约 33ms 采一次光标位置（≈30Hz）
    ├─ 原生 helper：cursor-monitor.exe
    │     WH_MOUSE_LL 低级钩子 → stdout「INTERACTION:mousedown:1」等
    │     GetCursorInfo 轮询 → stdout「STATE:pointer」等
    └─ 备用：uiohook-napi 全局 mousedown/mouseup（Windows/Linux）
停止后写入  <视频路径>.cursor.json
编辑器 / 导出器用这份 JSON 叠光标、推缩放
```

关键文件：

| 文件 | 职责 |
|------|------|
| `electron/native/cursor-monitor/src/main.cpp` | `SetWindowsHookExW(WH_MOUSE_LL)` 报按下/抬起；`GetCursorInfo` 映射系统光标句柄到 `arrow/text/pointer/...` |
| `electron/ipc/cursor/monitor.ts` | spawn helper，解析 `INTERACTION:` / `STATE:` 行 |
| `electron/ipc/cursor/interaction.ts` | 左/右/中键 → `click` / `double-click` / `right-click` / `middle-click` / `mouseup`；双击用 350ms + 归一化距离 ≤0.04 |
| `electron/ipc/cursor/telemetry.ts` | 位置归一化到选中窗口或显示器；落盘 |
| `electron/ipc/utils.ts` | 路径：`${videoPath}.cursor.json` |
| `electron/ipc/constants.ts` | 版本 2；采样 33ms；最多约 1 小时 × 30Hz |

位置算法要点：`screen.getCursorScreenPoint()` 相对「所选窗口 bounds」或「所选显示器 bounds」得到 `cx, cy ∈ [0,1]`。  
**没有**窗口标题、进程名、控件、像素内容。

键盘：本链路**不记录**按键与输入文本。

## 三、落盘长什么样

`writeCursorTelemetry` 写出：

```json
{
  "version": 2,
  "samples": [
    { "timeMs": 1024, "cx": 0.42, "cy": 0.61, "interactionType": "move", "cursorType": "arrow" },
    { "timeMs": 1480, "cx": 0.44, "cy": 0.60, "interactionType": "click", "cursorType": "pointer" },
    { "timeMs": 1520, "cx": 0.44, "cy": 0.60, "interactionType": "mouseup", "cursorType": "pointer" }
  ]
}
```

字段含义：

| 字段 | 对视频编辑 | 对 AI 复现 |
|------|------------|------------|
| `timeMs` | 对齐视频时间轴 | 能还原节奏，不能还原「等页面加载完」 |
| `cx, cy` | 画面相对位置 | 分辨率/DPI/窗口移动后全部失效 |
| `interactionType` | 点、双击、右键、中键、移动、抬起 | 无「输入了什么字」 |
| `cursorType` | 换光标皮肤 | 弱信号：I-beam 可能在编辑，hand 可能在链接上 |

旁边通常还有 **mp4 画面**。画面里有按钮文字，模型可以「看视频猜步骤」，但那是**非结构化、不可靠、不可回归**的理解，和 Playwright 的 selector 不是一类数据。

## 四、AI 能不能理解？

| 问法 | 答 |
|------|----|
| 能不能当演示视频给模型看，讲出「大概点了搜索、又点了发送」？ | 有时能，尤其配合原片。属于看片复述，不是可执行规格。 |
| 能不能当操作序列交给智能体稳定复现？ | **不能。** 缺目标身份、缺键盘、缺窗口、缺成功判据。 |
| 把 Recordly 改造成桌面 RPA 录制器合不合适？ | **不合适当底座。** 它是成片工具；硬加 UIA/CDP/OCR 会和 G1–G4 抢核心路径，行数与风险都大。 |

Recordly 对本研究的价值：证明「全局钩子 + 归一化坐标 + JSON」在 Electron 里**工程上可行**；也证明**只做到这一层远远不够**。

## 五、和目标金路径的缺口清单

要达到「录日常工作 → AI 理解 → 生成应用」，至少还缺：

1. **键盘事件**（含 IME 中文：应按「提交后的文本」记，而不是每个 WM_KEYDOWN）。
2. **前台窗口证据**：HWND / pid / 标题 / 进程名 / 边界。
3. **点击瞬间截图**（全屏或目标窗）+ 可选短视频。
4. **定位器（按层）**：Electron 用 DOM 选择器；Windows 用 UIA 属性；自绘用图像模板 / OCR 框。
5. **步骤语义**：把连续 move 压成「步骤」，而不是 30Hz 点列。
6. **回放执行器**与**成功判据**（窗口出现、文本变化、截图比对）。
7. **与网页录制分轨**：桌面档不要塞进现有 Playwright archive 假装是 DOM。
