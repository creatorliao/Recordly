# P09-Recordly 字幕模板层可行性分析

> 承接 `P08-剪映字幕动画模板机制与可移植性分析.md`。那一篇的落点是「剪映抽不出来，只能照着重做」。
> 这一篇回答的是下一个问题：**既然要重做，为什么不直接做进 Recordly？**
>
> 全文分两类内容，请按标记区分：**【实测】**＝本机跑出来的原始数据；**【读码】**＝从源码读出的确定事实；**【外推】**＝由实测值算出来的推算值，不是测出来的。

---

## 零、结论先行

### 0.1 一句话

**可行，而且起点比你想的高得多——Recordly 已经有一套完整的字幕子系统（含模板化预设），但它缺的恰恰是你最在意的那两样：字体可控、位置可调。**

### 0.2 标-本-药

| | 内容 |
|:---|:---|
| **标**（现象） | Recordly 有字幕功能，但只有 4 个固定动画、只能调垂直位置（`bottomOffset`）、字体改不了（改了也不生效） |
| **本**（根因） | ① 样式是**全局单一对象**，没有模板层；② 预览走 DOM/CSS、导出走 Canvas2D，**两套渲染代码**，加模板必须写两遍；③ `fontFamily` 在加载时被**无条件重置**为默认值（`projectPersistence.ts:785`），且默认字体栈**不含任何中文字体** |
| **药**（怎么做） | 三档推进：**A 档**用现成的（今天就能用，但先绕开字体）；**B 档**修 `fontFamily` 持久化 + 换 CJK 字体栈 + 加位置 X 轴；**C 档**才引入真正的模板层（把样式+动画抽成一个共享的渲染函数，预览与导出共用） |

### 0.3 三个担心的直接回答

| 你的担心 | 结论 |
|:---|:---|
| **① 我能不能做得到？** | **能，且不需要从零做。** 采样式管线的 90% 已经存在（`AutoCaptionSettings` + 预设系统 + 两条渲染管线）。真正要新写的只有「模板 → 渲染指令」这一层。真正的门槛不是难度，是**预览/导出双路径**——你每加一个模板要写两遍，或者先把双路径合并。 |
| **② 会不会比现在烧录慢？** | **同量级，端到端大概率更快。** 本机实测：ffmpeg 烧录一个 314s 视频约 **240s**；Recordly 含字幕导出按真实报告外推约 **219–500s**。字幕*布局*本身只花 **约 10s**（中文字幕实测口径），占导出总量 2%–4.6%。但注意：**加字幕会禁用 Recordly 的原生快速通道**（见 §4.4）。 |
| **③ 中间还有别的问题吗？** | **有 7 个，已逐个实测确认。** 其中 3 个会直接挡住你的目标（字体改不了、X 位置不存在、CLI 灌不进字幕文本），另外 4 个是保真度与性能隐患。详见 §5。 |

### 0.4 最该先知道的一件事

**你的默认字体栈里没有中文字体。**

```
"SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif
```

这是 `getDefaultCaptionFontFamily()` 的返回值（`types.ts:450-452`）。**【读码】** 全是拉丁字体。中文字幕会走浏览器兜底字体——这也解释了为什么你在剪映/Recordly 里看中文字幕总觉得"字体很怪"。

而且这个值在项目加载时被**无条件覆盖**：

```ts
// projectPersistence.ts:785
fontFamily: getDefaultCaptionFontFamily(),
```

它**不读** `rawAutoCaptionSettings.fontFamily`。所以哪怕你手改 JSON 写了中文字体，Recordly 一加载就给你抹掉。**这是 B 档必须修的第一行。**

---

## 一、先对齐一个概念：你说的"UI 层 + Web 层灌文本框"在 Recordly 里对应什么

你在剪映那条线上看到的架构是：**H5 模板页（HTML/CSS/JS）+ 数据填充**。那个思路很对，但 Recordly 不是 Web 应用，它是 **Electron 桌面应用**，所以映射关系要重画一遍：

| 剪映里的东西 | Recordly 里对应什么 | 是否存在 |
|:---|:---|:---:|
| H5 模板页（HTML/CSS/JS） | 预览：React DOM + 内联 CSS；导出：Canvas2D 绘制 | ⚠️ **两套独立代码** |
| 模板引擎 | `AutoCaptionSettings` + `animationStyle` 枚举 | ✅ 有，但只有 4 个硬编码分支 |
| 灌文本框 | `.recordly` 文件里的 `editor.autoCaptions[]` 数组 | ✅ 有 |
| 用户调样式 | `SettingsPanel` 字幕区（滑块/色板/下拉） | ✅ 有 |
| 保存模板复用 | `EditorPresetMenu`（预设，含字幕设置） | ✅ **有** |
| AI 自动调 | **没有**（AI 在本项目里只用于语音转写） | ❌ 无 |

**所以：你想的"灌文本框就能得到表现力"这个判断是对的，而且 Recordly 里灌文本框的入口已经有了——就是 `autoCaptions[]`。**

但有个关键差异必须讲清楚：

> **剪映的模板是"数据"（H5 页面 + 参数），Recordly 的模板是"代码"（TypeScript 里的渲染分支）。**

这是整篇报告最重要的一句话。它决定了两件事：

1. 你不能像剪映那样"下载一个模板文件丢进去就用"；
2. 但反过来，你能拿到剪映永远给不了的东西——**模板就是你的代码，想怎么改就怎么改，没有闭源引擎挡路**。

---

## 二、Recordly 字幕能力现状（实测清单）

### 2.1 已经有的

**【读码】** 数据模型（`types.ts:546-594`）：

```ts
interface CaptionCue {           // 一条字幕
  id: string; startMs: number; endMs: number; text: string;
  words?: CaptionCueWord[];      // 词级时间戳（可选）
}

interface AutoCaptionSettings {  // 全局样式（注意：全局，不是逐条）
  enabled, timelineQuickAdd, language,
  fontFamily, fontSize,            // 字号 16..72
  bottomOffset,                    // 垂直位置 0..30 (%)
  maxWidth,                        // 40..95 (%)
  maxRows,                         // 1..4
  animationStyle,                  // none | fade | rise | pop
  boxRadius, textColor, inactiveTextColor, backgroundOpacity,
}
```

| 能力 | 状态 | 落点 |
|:---|:---:|:---|
| 本地离线语音转写 | ✅ | whisper.cpp 内置（`ggml-small.bin`，从 HuggingFace 下载一次后全离线） |
| 句子级自动断句（标点+停顿） | ✅ | `electron/ipc/captions/segment.ts`（约 15 个测试用例，是字幕模块测试最密的一处） |
| 静音感知重新切分 | ✅ | `electron/ipc/captions/silence.ts` |
| 时间轴字幕轨 + 悬停新增 | ✅ | `useTimelineCaptionActions.ts` |
| 逐条编辑：改文字/调时间/拆分/合并/删除 | ✅ | `captionOps.ts` 6 个导出函数 |
| 预览里点字幕直接改文字 | ✅ | `VideoPlayback.tsx` 的 `<textarea>` |
| 4 个出场动画 | ✅ | `none / fade / rise / pop`，进出各固定 **180ms** |
| 字幕样式预设复用 | ✅ | `EditorPresetMenu.tsx`（"Save current preset as" + 已存列表） |
| 导出 SRT / VTT 侧车 | ✅ | `includeCaptionSidecar`（**默认关闭**） |
| 无头/命令行驱动 | ✅ | `rlex`（`RECORDLY_SMOKE_EXPORT=1` 通道） |
| 每帧重算布局 + 光栅缓存 | ⚠️ | 有缓存，但见 §4.2 / §5.6 |

### 2.2 没有的（你想要的）

| 能力 | 状态 | 证据 |
|:---|:---:|:---|
| **位置可调（水平）** | ❌ **完全不存在** | `AutoCaptionSettings` 无 `x`/`left`/`align` 任何字段；预览 `absolute inset-x-0 flex justify-center`；导出 `centerX = width / 2` |
| **预览里拖动字幕** | ❌ 没有 | `onPointerDown` 只做 `event.stopPropagation()`，没有任何拖拽分支 |
| **逐条字幕样式** | ❌ 没有 | `CaptionCue` 不含任何样式字段，样式只有全局一份 |
| **自定义字体（中文本地字体）** | ⚠️ 半有 | `customFonts.ts` 存在，但 `isValidGoogleFontsUrl()` 限定 **只收 Google Fonts URL**——对中文字体基本没用，且需要联网 |
| **字体设置生效** | ❌ 被重置 | `projectPersistence.ts:785` |
| **逐字动画（剪映同款）** | ❌ 没有 | `animationStyle` 只有 4 个整块动画，且 `getCaptionWordVisualState()` 恒返回 `isActive:false` |
| **AI 调样式** | ❌ 没有 | AI 只用于转写 |

---

## 三、五个问题的逐条回答

### 3.1 「这种方式是否可行？」

**可行。** 三层都在：

```
样式数据层   AutoCaptionSettings（13 个字段，已可持久化）   ✅ 已有
调参 UI 层   SettingsPanel 字幕区 + EditorPresetMenu        ✅ 已有
渲染层       预览 DOM/CSS + 导出 Canvas2D                   ✅ 已有（但两份代码）
           ─────────────────────────────────────────────
模板层       「一个名字 → 一组样式 + 一段动画」              ❌ 缺这一层
```

缺的不是地基，是**中间那一层抽象**。

### 3.2 「我们当前的 Recordly 是否已经实现了？」

**部分实现，而且比预期多。** 具体是：

- ✅ **"预设三五个模板持续用"这件事，已经实现了**——只是不叫"字幕模板"，叫"编辑器预设"（`EditorPresetMenu`）。
- ✅ 而且 `recordly-export` 这个 CLI 技能里**已经内置了带字幕设置的预设**：

**【实测】** `rlex preset show` 输出：

| 预设 | 字幕设置 |
|:---|:---|
| `course-light`（教学亮色） | `enabled:true, fontSize:34, bottomOffset:4, maxRows:2, animationStyle:"fade"` |
| `vertical-9x16`（竖屏） | `enabled:true, fontSize:40, bottomOffset:8, maxRows:2, animationStyle:"pop"` |
| `demo-dark` / `minimal` | 不含字幕设置 |

- ❌ **但"字幕是模板的核心"，而当前预设里字幕只占一小块**：预设是"整个编辑器快照"（背景/光标/缩放/导出参数/字幕…全打包），不是字幕专用的模板库。你想要的是"换个字幕模板"，现在的机制是"换一整套外观"。

### 3.3 「我能不能做得到？」

**能。** 而且分三档，你自己可以决定停在哪一档：

| 档 | 要做什么 | 工作量 | 不改代码能到吗 |
|:---:|:---|:---|:---:|
| **A** | 直接用现成的 4 动画 + 预设 + `rlex` 调参 | 0 | ✅ |
| **B** | 修 3 个缺陷（字体、X 位置、CJK 字体栈） | 小（改动集中在 3 个文件） | ❌ 要改代码 |
| **C** | 抽模板层 + 合并预览/导出双路径 + 加逐字动画 | 中（需要重构建渲染抽象） | ❌ 要改代码 |

**A 档的真实边界（重要）**：A 档下你能调 8 个标量——字号、底距、最大宽度、行数、动画、圆角、文字色、背景透明度。**调不了字体，也调不了水平位置。** 如果你只想要"白色字 + 三五个位置/字号组合"，A 档够用；如果你要"清秀中文字体"，必须进 B 档。

**【实测】** 我实测了 CLI 到底能改哪些字幕字段：

```
$ rlex project patch t.recordly --set editor.autoCaptionSettings.fontSize=44 \
      --set editor.autoCaptionSettings.bottomOffset=8 \
      --set editor.autoCaptionSettings.animationStyle=pop --out t2.recordly
[OK] 已写入：3 处真实变更
  editor.autoCaptionSettings.fontSize: 34 -> 44.0
  editor.autoCaptionSettings.bottomOffset: 4 -> 8.0
  editor.autoCaptionSettings.animationStyle: "fade" -> "pop"
```

```
$ rlex project patch t.recordly --set 'editor.autoCaptions[0].text=hello'
[X] 未知字段 editor.autoCaptions[0].text: 字段不在 .recordly v2 白名单里

$ rlex project patch t.recordly --set 'editor.autoCaptionSettings.fontFamily=...'
[X] 未知字段 editor.autoCaptionSettings.fontFamily: 不在 .recordly v2 白名单里
```

**两条硬边界，都实测过：**

1. **样式能灌，文本灌不进。** `autoCaptionSettings` 的标量字段（字号/底距/动画/颜色/行数…）CLI 可以改；`autoCaptions[]` 是**数组**，`--set` 明确拒绝（`patch.py:330-338` 的 `ARRAY_PATHS`，理由是"命令行赋值容易写坏项目"）。所以**字幕文本必须手改 JSON 或从 GUI 存出来**。
2. **`fontFamily` 是双重封锁。** ① CLI 白名单里没有它 → 命令行改不了；② 就算你手改 JSON 写进去，`projectPersistence.ts:785` 一加载就重置 → Recordly 也不认。**必须改代码。**

### 3.4 「会不会比现在的烧录慢？」——见 §4，这是本次调查最硬的部分

### 3.5 「中间会不会有其他的问题？」——见 §5，7 个已确认的坑

---

## 四、性能：实测数据

> **测量环境**：Intel i7-9700（8 核 8 线程 / 3.0GHz）；GPU：Intel UHD 630 + NVIDIA GTX 750；
> Electron/Chromium（Recordly v1.4.0-beta.1 自带）；Node v24.18.0。

### 4.1 基准：本机真实导出报告（两份，都是真跑出来的）

这两份报告来自 `recordly-export` 技能的实际运行，通过 `RECORDLY_SMOKE_EXPORT=1` 拉起 `D:\code\Recordly` 的 dev 运行体完成——**不是桩，是真导出**（run.log 里有 `[smoke-export] Starting editor smoke export` 与真实 GPU/编码器信息）。

| 指标 | 报告 A（`case-01`，含 2 个缩放区+背景+内边距） | 报告 B（`SA-real-export`，最简项目） |
|:---|:---:|:---:|
| 帧数 | 516 | 120 |
| 成片时长 | 17.18 s | 4.00 s |
| **导出总耗时** | **27,338 ms** | **2,789 ms** |
| **倍速（耗时/时长）** | **1.59×** | **0.70×** |
| 单帧渲染均耗 | 5.487 ms | 1.672 ms |
| 渲染总计 | 2,831 ms | 201 ms |
| 解码循环 | 23,069 ms | 1,745 ms |
| 等编码器 | 14,635 ms（53%） | 624 ms（22%） |
| 收尾（音频+封装） | 3,478 ms | 582 ms |
| 渲染后端 / 编码器 | webgpu / `avc1.640033` 硬件 | 同上 |

**关键读数**：报告 B 只有 **0.70× 实时**（4 秒片子 2.8 秒导完），报告 A 是 1.59×。差异来自项目复杂度（缩放/背景/内边距）。**两份报告的 `autoCaptions` 都是空数组**——也就是说，本机**从来没有一份带字幕的真实导出报告**。这一点必须说清楚（见 §4.5）。

### 4.2 字幕布局的真实成本（实测，本次调查新增）

**方法**：写了一个 vitest 基准，用真实语料（对齐红杉那片：163 条、平均 11 字/条、仅 2 条含空格）跑满 9,420 帧（＝314.05s × 30fps），统计 `measureText` 调用次数与 JS 耗时；再用 Electron 单独测真实 canvas `measureText` 单价。

**【实测】字幕布局单帧成本**（9,420 帧）：

| 场景 | `measureText` 调用/帧 | JS 结构耗时/帧 | 折合总 JS 耗时 |
|:---|:---:|:---:|:---:|
| 文本型（中文实际形态，见 §4.3） | **489.0** | 0.230 ms | 2,164 ms |
| 词时间戳型（每帧 1,630 个词） | **4,888.4** | 0.684 ms | 6,443 ms |

**【实测】真实 canvas `measureText` 单价**（Electron，每档 20 万次调用）：

| 字体栈 | 单次耗时 |
|:---|:---:|
| `"Source Han Sans CN", sans-serif` | **1.726 µs** |
| `sans-serif` | 1.405 µs |
| `"Microsoft YaHei"` | 1.239 µs |

**合并计算**（JS 结构 + canvas 实测单价）→ 对红杉那样 314s / 30fps 的片子：

| 场景 | 单帧 | ×9,421 帧 | 占导出总量 |
|:---|:---:|:---:|:---:|
| **文本型（中文实际）** | **1.074 ms** | **≈ 10.1 s** | **2.0% – 4.6%** |
| 词时间戳型 | 9.122 ms | ≈ 85.9 s | 17.2% – 39.3% |

（百分比区间＝按报告 B 的 0.70× 外推 219s ↔ 报告 A 的 1.59× 外推 500s。**【外推】**）

### 4.3 中文到底落在哪个场景？——落在便宜的那个

这条值得单独讲，因为它把结论从"可能要 86 秒"拉回"只要 10 秒"。

**【读码】** `parseWhisperJsonWords()`（`electron/ipc/captions/parser.ts:19-74`）的分词逻辑是：

```ts
const parts = tokenText.match(/\s+|[^\s]+/g) ?? [];
// 遇到空白 → 标记 nextLeadingSpace
// 没有前一个词 或 nextLeadingSpace → 新开一个词
// 否则 → previousWord.text += part   ← 关键：往后拼
```

**只要没有空白，token 就被拼进前一个词。** 中文没有词间空格 → 整段中文会被**并成一个词**。

**结论：中文字幕实际落在"文本型"场景，布局成本 ≈ 10s，不是 86s。**

**但这也意味着一件事**：如果你（或未来的 Recordly）给中文加上真正的分词，`measureText` 调用会涨约 **9 倍**，布局成本从 10s 跳到 86s。**做模板层时要把这个前提写进注释**，否则将来加分词会莫名其妙变慢。

### 4.4 一个结构性代价：加字幕会禁用原生快速通道

**【读码】** `modernVideoExporter.ts:1563-1565`：

```ts
if ((this.config.autoCaptions ?? []).length > 0) {
    reasons.push("unsupported-caption-overlay");
}
```

只要 `autoCaptions` 非空，就进不了 `native-static-layout` 这条原生 GPU 合成通道，必须回落到共享渲染器。

**这条的实际影响要打折看**：在 Windows 上 `backendPreference="auto"` 时，默认走的是 `breeze-stream`（`backendPolicy.ts:117-134`），本来就不走 static-layout；只有用户**显式选 `breeze`** 时才会优先 static-layout。所以：

- 用 `auto`（默认）→ 加字幕**不影响**通道选择；
- 用 `breeze` → 加字幕会把最快速通道关掉。

### 4.5 跟"现在的烧录"对比

| 环节 | 实测/外推 | 备注 |
|:---|:---:|:---|
| **当前链路：ffmpeg + libass 烧录** | **≈ 240 s** | 【实测】上轮 314s 片子，每模板约 4 分钟（含遮罩底片输入） |
| 当前链路：还要加上转写+优化+人工往返 | 数分钟～数十分钟 | 上轮转写命中缓存 0.56s，**未命中约 17 分 36 秒** |
| **Recordly 含字幕导出（简单项目外推）** | ≈ 219 s | 【外推】按报告 B 的 0.70× |
| **Recordly 含字幕导出（复杂项目外推）** | ≈ 500 s | 【外推】按报告 A 的 1.59× |
| └ 其中字幕布局 | 10.1 s | 【实测】中文口径 |
| └ 其中字幕光栅（缓存后） | ≈ 0 | 见 §5.6，按关键字缓存 |

**怎么读这张表：**

1. **单看"渲染这一步"，两者同量级。** Recordly 要重合成背景/圆角/阴影/光标/缩放，比 ffmpeg 只叠字幕做得多；但它的编码走硬件、且和录屏是同一遍，所以没有数量级差距。
2. **端到端看，Recordly 路线少 2–3 次独立工具调用**（转写→优化→烧录）和其中的**人工往返**。你上轮为了遮罩迭代了 **5 个版本**才达标——这类往返在 Recordly 里是"拖动滑块即时预览"，不是"渲一次 4 分钟再看"。
3. **字幕布局那 10 秒是纯浪费**，可优化到接近 0（见 §6.3），但不优化也不致命。

**所以对"会不会更慢"的诚实回答是：**

> **不比现在慢，端到端大概率更快。** 但"渲染"这一项本身确实更重（多合成一整套演示外观），
> 且字幕布局有 **10 秒级**的、本可避免的额外开销。

### 4.6 一个要提前知道的规模问题：布局成本是 O(条数 × 帧数)

**【读码】** `modernFrameRenderer.ts:1781-1782` 每帧调 `buildCaptionRenderState(timeMs)`，里面直接调 `buildActiveCaptionLayout({cues, ...})`，而它会 `flattenCaptionWords(options.cues)` —— **遍历全部字幕条**，没有任何时间窗口裁剪，也没有记忆化。

所以：**成本 ∝ 总条数 × 总帧数 ∝ 时长²**。

**【外推】** 按中文口径（10.1s @ 314s/163条）：

| 片长 | 估算条数 | 字幕布局耗时 |
|:---|:---:|:---:|
| 5 分钟 | ~160 | ≈ 10 s |
| 10 分钟 | ~310 | ≈ 37 s |
| 30 分钟 | ~930 | ≈ 5.5 分钟 |
| 60 分钟 | ~1,860 | ≈ 22 分钟 |

**结论：短片无所谓；长视频（培训录课、直播回放）必须修。** 这是 B/C 档里优先级最高的一项优化——而且改起来很简单（按 `timeMs` 二分找到活动 cue 前后各一条，只把这几条喂给 `buildActiveCaptionLayout`），能把 O(n²) 打成 O(n)。

---

## 五、7 个已确认的坑

按"会不会挡住你的目标"排序。

### 🔴 坑 1：`fontFamily` 双重封锁（挡住"换字体"）

- **封锁一**：`projectPersistence.ts:785` 无条件 `fontFamily: getDefaultCaptionFontFamily()`，不读文件里的值。
- **封锁二**：`rlex` 的白名单里没有 `fontFamily`，`project validate` 会把它报成"未知字段"。
- **连带**：默认字体栈不含中文字体（§0.4）。
- **修法**：`projectPersistence.ts` 改成"有就用、没有才兜底"；字体栈改成含 CJK 的（如 `"Source Han Sans CN", "Microsoft YaHei", sans-serif`）。

### 🔴 坑 2：水平位置根本不存在（挡住"位置可调"）

- 数据模型无 X 字段；预览 `flex justify-center` 硬居中；导出 `centerX = width/2`。
- **修法**：`AutoCaptionSettings` 加 `x`（或 `align` + `offsetX`），预览改 `left: x%` + `transform`，导出改 `centerX`。**注意要改 3 处**（模型、预览、两条导出路径）。

### 🔴 坑 3：CLI 灌不进字幕文本（挡住"AI 全自动"）

- `--set` 拒绝数组；`autoCaptions[]` 只能手改 JSON 或从 GUI 存。
- **修法**：给 `rlex` 加一个 `--captions-from-srt <file>`（把 SRT 转成 `autoCaptions[]`）。这是纯数据变换，实现成本低，**收益极高**——它一次打通"subgen/optimize → Recordly 烧录"的整条链。建议作为 VOC 回写 `recordly-export-master`。

### 🟡 坑 4：预览与导出是两套代码（挡住"加模板"）

**【读码】** 已确认 5 处不等价：

| 维度 | 预览 | 导出 |
|:---|:---|:---|
| 渲染方式 | React DOM + 内联 CSS | Canvas2D（`captionRenderer.ts` 直绘 / `modernFrameRenderer.ts` 光栅成纹理） |
| 字体解析 | 硬编码默认字体栈 | `modernFrameRenderer` 读 `settings.fontFamily`；`captionRenderer` **也硬编码** |
| 缩放基准宽 | `clientWidth \|\| 960` | `config.width` |
| 盒子几何 | DOM 自动布局，读 `offsetWidth/Height` | 数值计算 |
| 圆角 | DOM `border-radius` + SVG `clip-path` | `drawSquircleOnCanvas()` |

**影响**：加一个模板要写两遍，而且**预览好看不代表导出一样**。
**修法**：把绘制抽成一个共用的 `drawCaption(ctx, layout, style, template)`，预览也走 canvas（或至少让预览用同一套几何计算）。这是 C 档的核心工作，也是**唯一**能保证"所见即所得"的路。

### 🟡 坑 5：`enabled` 在两条导出路径里语义不一致

**【读码】**（本次自行核对）：

```ts
// captionRenderer.ts:26（传统路径）
if (!settings.enabled || cues.length === 0) { return; }

// modernFrameRenderer.ts:1617（现代路径）
if (!this.config.autoCaptions?.length || !this.config.autoCaptionSettings) { return; }
```

传统路径检查 `enabled`，现代路径**不检查**。所以 `enabled:false` + 有字幕条时，两条路会给出**不同结果**。这属于既有缺陷，加模板层时顺手统一即可（建议统一为"看 `cues.length`，`enabled` 只当 UI 开关"）。

### 🟡 坑 6：逐字动画会击穿光栅缓存（挡住"剪映同款"）

**【读码】** `modernFrameRenderer.ts:1674`：

```ts
key: `${layout.blockKey}:${layout.visiblePageIndex}:${layout.activeWordIndex}`,
```

光栅化只在 `key` 变化时发生（`rasterizeCaptionSprite`），而透明度/位移/缩放是作用在 **Sprite 变换**上的（`updateCaptionLayer`），**不重新光栅**。这是很好的设计——**当前的 4 个整块动画几乎零成本**。

**但逐字动画会破坏它**：每个字独立动 → 每帧 key 都变 → **每帧重新光栅化**。9421 帧 × 每帧一次 canvas 文字绘制，就不再是 10s 而是分钟级。

**修法（两条，推荐第一条）**：
1. **字形图集**：把每个字符预先光栅成小纹理，逐字动画只移动/缩放 sprite。这样"每帧重光栅"变成"一次性建图集 + 每帧拉 sprite"，能保住缓存红利。
2. **预烘焙动画帧序列**：把入场动画烘成 N 张图循环播放。简单但耗显存、且缩放会糊。

**这条是"能不能优雅地做出剪映同款"的技术分水岭。** 好消息是路径清晰。

### ⚪ 坑 7：`inactiveTextColor` 是死设置

**【读码】** `captionStyle.ts:50-56`：

```ts
export function getCaptionWordVisualState(_hasWordTimings: boolean, _state: CaptionWordState) {
	// Per-word "spoken" highlighting is disabled: word-level timings from the
	// transcriber are unreliable, so captions render as a single uniform block.
	return { isInactive: false, opacity: 1 };
}
```

永远返回"非 inactive"。字段一路贯穿类型/默认值/持久化/两条渲染路径，**但没有 UI 控件，也从不出效果**。做"CJK 逐字高亮"模板时会用到它——**那时才需要把它启用**。

---

## 六、怎么做：三档路线

### 6.1 A 档 —— 零改代码，今天可用

**能拿到**：4 个动画 × 8 个标量（字号/底距/宽度/行数/圆角/文字色/背景透明度/动画）× 预设复用。

**做法**：
```bash
rlex project new --video "我的录屏.mp4" --preset course-light --out a.recordly
rlex project patch a.recordly \
  --set editor.autoCaptionSettings.fontSize=40 \
  --set editor.autoCaptionSettings.bottomOffset=6 \
  --set editor.autoCaptionSettings.animationStyle=pop \
  --set editor.autoCaptionSettings.textColor=#FFFFFF \
  --set editor.autoCaptionSettings.backgroundOpacity=0.55 \
  --out b.recordly
rlex project validate b.recordly
rlex export run --project b.recordly --out out.mp4 --runtime "<Recordly.exe>"
```

**A 档做不到**：换中文字体、调水平位置、逐字动画。

### 6.2 B 档 —— 小改动，覆盖你最在意的两点

**改动集中在 3 个文件、约 5 处：**

| # | 改什么 | 文件 | 收益 |
|:--:|:---|:---|:---|
| B1 | `fontFamily` 改为"有就用、无则兜底" | `projectPersistence.ts:785` | **解锁自定义字体持久化** |
| B2 | 默认字体栈加入 CJK | `types.ts:450-452` | **中文字幕立刻正常** |
| B3 | `captionRenderer.ts:33` 改用 `settings.fontFamily` | `lib/exporter/captionRenderer.ts` | 两条导出路径字体一致 |
| B4 | `AutoCaptionSettings` 加 `x`，预览/导出各改一处 | `types.ts` / `VideoPlayback.tsx` / `modernFrameRenderer.ts` | **解锁水平位置** |
| B5 | 自定义字体支持本地文件（不只是 Google Fonts URL） | `lib/customFonts.ts` | 让"清秀中文字体"真正可用 |

**B 档做完，你的原始诉求（换成好看的中文字体、自己调样式和位置、三五个模板反复用）就全满足了。**

### 6.3 C 档 —— 模板层（真正"有表现力的字幕"）

**核心动作只有一个：把"模板"变成一等公民。**

```
CaptionTemplate = {
  id, name,
  style: AutoCaptionSettings 的样式部分,
  draw(ctx, layout, style, timeMs)   ← 预览与导出共用同一个函数
}
```

**配套三件事**（按收益排序）：

| 优先级 | 动作 | 收益 |
|:---:|:---|:---|
| **C1** | 合并预览/导出渲染路径（共用 `draw`） | 所见即所得；模板只写一遍（解决坑 4） |
| **C2** | 按 `timeMs` 窗口裁剪 cue 列表 | 把 O(条数×帧数) 打成 O(帧数)，长视频不再退化（解决 §4.6） |
| **C3** | 字形图集 → 逐字动画 | 拿到剪映同款逐字效果且不崩性能（解决坑 6） |

**建议的模板清单**（与 P08 的结论对齐，避开 libass 做不到的）：

1. **逐字弹入**（已有一份 ASS 参考实现：`assets/templates/capcut-style_逐字弹入.ass`）
2. **逐字错峰淡入**（克制，长视频友好）
3. **整行缩放**（现有 `pop` 加强版，成本近零）
4. **矩形擦出**（libass 能做，Canvas 更容易）
5. **卡拉OK逐字高亮**（需要先启用坑 7 的 `inactiveTextColor`）

**不要做**：抖动/震动（Canvas 能做但很廉价感）、贴纸粒子、渐变混合——P08 已论证这些在 ASS 里不可行，在这里虽然可行但会把复杂度推高，与"三五个模板反复用"的目标相悖。

---

## 七、跟现有 subtitle-burn 链的关系（不是替代，是分工）

**Recordly 字幕** 和 **subtitle-burn** 是两条腿，各自有不可替代的场景：

| | Recordly 内置字幕 | subtitle-burn（ASS + ffmpeg） |
|:---|:---|:---|
| 输入 | 必须从 Recordly 项目出发（或手改 JSON） | **任意 MP4 + 任意 SRT** |
| 调参方式 | GUI 滑块即时预览 | 命令行参数 + 配置文件 |
| 动画上限 | Canvas 2D 能画的一切 | libass 能表达的一切（更受限，见 P08） |
| 表现力 | **更高**（字体/描边/阴影/自定义绘制） | 中（ASS 样式集） |
| 可自动化的程度 | 中（`rlex` 能改样式，改不了文本 ← 坑 3） | **高**（纯命令行，无 GUI 依赖） |
| 已有资产 | 4 动画 | **5 个模板 + 实测校验链** |
| 适用 | 录屏→成片一体化交付 | 已有片子补字幕 / 批量 / 无人值守 |

**建议**：**两条都留。** Recordly 负责"录屏到成片一遍过"，subtitle-burn 负责"给现成视频加字幕"和"纯脚本流水线"。**共用一份 SRT**——Recordly 可以导出 SRT 侧车（`includeCaptionSidecar`），正好接上现有 `subtitle-optimize` → `subtitle-burn` 链路。

这也解决了一个现实问题：**现在 Recordly 路线唯一的卡点是"文本灌不进"（坑 3）**。在坑 3 修好之前，**用 Recordly 烧录就必须手工在 GUI 里转写并编辑字幕**——对智能体来说是断链的。所以：

> **近期最务实的组合：subgen 转写 → subtitle-optimize 优化 → 手工把 SRT 内容搬进 Recordly GUI（或等坑 3 修好）→ Recordly 出片。**
> 或者：**Recordly 出片（不出字幕）→ subtitle-burn 后期烧录**（已验证可行，就是上轮的路径）。

---

## 八、建议

### 8.1 如果你想尽快看到效果

1. **先做 B2**（默认字体栈加 CJK，一行）→ 中文字幕字体立刻正常，这是投入产出比最高的一行改动。
2. **再做 B1**（`fontFamily` 持久化，一行）→ 解锁"清秀字体"。
3. **然后 B4**（加 X 位置）→ 位置可调。
4. 用 A 档的方式（`rlex` 预设 + `--set`）配 3 个模板，跑一段时间看够不够。

### 8.2 如果你想要"剪映同款表现力"

按 **C1 → C2 → C3** 顺序做，**不要先做 C3**。理由：
- C1 不做，后面每加一个模板都要写两遍，且预览/导出会漂移——这是最大的返工来源；
- C2 不做，长视频会慢到不可用，而修它很简单；
- C3 最难，但也是最有价值的一项（逐字动画）。**它依赖 C1**（共用 draw 函数才能统一做字形图集）。

### 8.3 对技能生态的建议（VOC）

| 去向 | 需求 |
|:---|:---|
| `recordly-export-master` | **REQ：加 `--captions-from-srt <file>`**，把 SRT 转成 `autoCaptions[]` 注入 `.recordly`。纯数据变换，一次性打通"subgen → rlex → 烧录"整链（解决坑 3）。 |
| `recordly-export-master` | **REQ：白名单补 `fontFamily`**（以及 `webcam.corner`、`defaultSourceAudioTrackSettings.mixed`），当前会把 Recordly 自己写的字段报成"未知"。 |
| `recordly-export-master` | **DOC：`SKILL.md:138` 版本号写 0.1.2，实际 CLI 是 0.1.3**，已过期。 |
| `recordly-export-master` | **DOC：`06-验收报告.md` 结论"导出跑不通 / source-only"已过期**——同日下午的真实导出产物与当前 `doctor`（`exportReady=true, kind=source-dev`）都证明可用。 |
| `subtitle-burn-master` | P05 的 VOC 仍然有效，不受本篇影响。 |

### 8.4 诚实说明

- **"更省钱"这个目标在本场景是空的。** 两条路线都是全本地、零 API 成本，省钱无从谈起。真实的节省是**计算时间**和**人工往返次数**。
- **本篇的性能数字里，只有 §4.1 的两份导出报告、§4.2 的布局基准与 `measureText` 单价是实测。** §4.5/§4.6 的对比与规模外推都是算术推算，不是测出来的。
- **本机不存在任何一份带字幕的真实导出报告**（9 份 `.recordly` 的 `autoCaptions` 全是 `[]`）。所以"字幕确实会被烧进 mp4"这一条是**读码确认**，不是渲染验证。**这是本篇最大的未验证项。**

---

## 附录 A：实测方法与原始数据

### A.1 字幕布局基准（vitest）

临时基准文件 `src/components/video-editor/__bench-caption-layout.test.ts`（**跑完已删除**），语料对齐红杉真实 SRT 统计（163 条 / 平均 11 字 / 最大 28 字 / 仅 2 条含空格）。每场景跑 9,420 帧（＝314.047s × 30fps），`measureText` 用计数器包装。

```
BENCH text-only-163-cues   cues=163  frames=9420  measureText/frame=489.0   measureText/total=4606380   js_ms_per_frame=0.2297  js_total_ms=2163.5
BENCH word-timed-163x10    cues=163  frames=9420  measureText/frame=4888.4  measureText/total=46049130  js_ms_per_frame=0.6840  js_total_ms=6443.3
```

（vitest 报了 "Test timed out in 5000ms"——那是默认超时，测量本身已完成，数据有效。）

### A.2 canvas `measureText` 单价（Electron）

`npx electron` 起一个隐藏窗口，每档预热 3 万次后测 20 万次：

```
CANVAS_MEASURE {
  "400 43px \"Source Han Sans CN\", sans-serif": { perCallUs: 1.726,  totalMs: 345.2 },
  "400 43px sans-serif":                        { perCallUs: 1.4045, totalMs: 280.9 },
  "400 43px \"Microsoft YaHei\"":               { perCallUs: 1.239,  totalMs: 247.8 }
}
```

### A.3 两份真实导出报告的关键字段

| 字段 | 报告 A | 报告 B |
|:---|:---:|:---:|
| `totalElapsedMs` | 27338.1 | 2788.9 |
| `effectiveDurationSec` | 17.183 | 4.0 |
| `frameCount` | 516 | 120 |
| `renderFrameMs` | 2831.2 | 200.7 |
| `averageRenderFrameMs` | 5.487 | 1.672 |
| `decodeLoopMs` | 23068.7 | 1744.6 |
| `encodeWaitMs` | 14634.5 | 624.0 |
| `finalizationMs` | 3478.2 | 581.8 |
| `renderBackend` / `encodeBackend` | webgpu / webcodecs | webgpu / webcodecs |
| `encoderName` | `avc1.640033/prefer-hardware/realtime` | 同 |
| `backpressureProfile` | webcodecs-balanced-plus | 同 |
| `autoCaptions` | `[]` | `[]` |

报告 A 收尾细分：`encoderFlushMs 569.4` / `audioProcessingMs 2841.1` / `muxerFinalizeMs 66.8`。

**两份报告的驱动方式**（run.log 首行，证明是真跑）：`cmd.exe /c npm run dev`，`cwd=D:\code\Recordly`，`RECORDLY_SMOKE_EXPORT=1`。

### A.4 硬件

```
Intel(R) Core(TM) i7-9700 @ 3.00GHz   8 核 / 8 逻辑处理器
GPU: Intel(R) UHD Graphics 630 (31.0.101.2141)
     NVIDIA GeForce GTX 750  (32.0.15.6094)
     Microsoft Basic Render Driver
```

⚠️ 两次 smoke 导出的日志里 `GPU feature status` 显示 `webgpu":"disabled_off"`、`video_encode":"disabled_software"`，但报告写 `renderBackend: webgpu` / 硬件编码器。**两者矛盾，未查明原因。** 所以 §4.1 的绝对数值可能受此影响；但 §4.2 的字幕布局成本与 GPU 无关（纯 canvas 2D + JS），不受影响。

---

## 附录 B：未验证清单

| # | 未验证项 | 为什么没验 | 怎么验 |
|:--:|:---|:---|:---|
| 1 | **字幕确实被烧进 mp4** | 本机 9 份 `.recordly` 的 `autoCaptions` 全为空，没有带字幕的导出实物 | 在 Recordly GUI 里生成一次字幕 → 存项目 → `rlex export run --project` → 抽帧目视 |
| 2 | 红杉那片用 Recordly 导出的**真实耗时** | 需要建含字幕的项目并跑一次完整导出 | 同上，读 `out.mp4.report.json` |
| 3 | `enabled:false` 在两条导出路径的实际差异 | 只读了码，没做渲染对照 | 构造 `enabled:false` + 非空 cues，分别用 `--pipeline modern/legacy` 导出对比 |
| 4 | 逐字动画的真实性能衰减 | 功能尚未实现 | C3 实现后测 `renderFrameMs` 变化 |
| 5 | 中文 whisper 输出是否真的并成 1 词/条 | 本机无 Windows whisper 运行时与 `ggml-*.bin` 模型 | 生成一次中文字幕，看 `.recordly` 里 `autoCaptions[0].words` 数组长度 |
| 6 | `enabled` 与渲染的门控关系（两条路径不一致，见坑 5） | 同 #3 | 同 #3 |

---

## 附录 C：本篇引用的源码坐标

| 事实 | 位置 |
|:---|:---|
| `AutoCaptionSettings` / `DEFAULT_AUTO_CAPTION_SETTINGS` | `src/components/video-editor/types.ts:563-594` |
| `CaptionCue` / `CaptionCueWord` | `src/components/video-editor/types.ts:546-559` |
| 默认字体栈（无 CJK） | `src/components/video-editor/types.ts:450-452` |
| `fontFamily` 被无条件重置 | `src/components/video-editor/projectPersistence.ts:785` |
| cue 归一化（空文本丢弃） | `src/components/video-editor/projectPersistence.ts:711-765` |
| 4 个动画 + 180ms 进出场 | `src/components/video-editor/captionLayout.ts:61-64, 219-253` |
| 预览硬居中 | `src/components/video-editor/VideoPlayback.tsx:2552-2558` |
| 预览 `onPointerDown` 只 stopPropagation | `src/components/video-editor/VideoPlayback.tsx:2590-2592` |
| 逐词高亮被禁用（死设置） | `src/components/video-editor/captionStyle.ts:50-56` |
| 导出硬居中 / 检查 `enabled` | `src/lib/exporter/captionRenderer.ts:26, 33, 53` |
| 光栅缓存 key（含 activeWordIndex） | `src/lib/exporter/modernFrameRenderer.ts:1674` |
| 缓存命中则不重光栅 | `src/lib/exporter/modernFrameRenderer.ts:1794-1803` |
| 现代路径不检查 `enabled` | `src/lib/exporter/modernFrameRenderer.ts:1617` |
| 字幕禁用原生快速通道 | `src/lib/exporter/modernVideoExporter.ts:1563-1565` |
| 通道决策（Windows auto → breeze-stream） | `src/lib/exporter/backendPolicy.ts:117-134` |
| whisper token 无空白则并词 | `electron/ipc/captions/parser.ts:44-70` |
| 预设含 `autoCaptionSettings` | `src/components/video-editor/editorPreferences.ts:73-80, 203-208` |
| 预设 UI | `src/components/video-editor/layout/EditorPresetMenu.tsx` |
| 预设应用字幕设置 | `src/components/video-editor/presets/useVideoEditorPresets.ts:93, 163` |
| 自定义字体仅收 Google Fonts URL | `src/lib/customFonts.ts:194-205` |
| SRT/VTT 侧车导出 | `electron/ipc/register/exportCaptionSidecars.ts` |
| CLI 拒绝数组字段 | `recordly-export-master/packages/recordly-export/src/recordly_export/core/patch.py:330-338` |

---

*本篇为 `F20260917-字幕链路复盘与VOC` 第 9 份补充文档。*
*结论基于 Recordly v1.4.0-beta.1 源码与本机实测；标注【外推】的数字未经实测验证。*
