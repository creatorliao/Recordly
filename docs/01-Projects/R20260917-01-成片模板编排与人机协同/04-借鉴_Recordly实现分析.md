# 04 · 借鉴：Recordly 实现分析（逐条溯源）

> 本文回答一个问题：**我们要做的工具，能站在 Recordly 的哪些既有能力上？哪些地方必须自己补？**
> 每条结论都带 `Recordly/路径:行`。证据分三档，**不许猜**：
>
> - **【已读源码确认】** —— 直接读到代码，可复现
> - **【实测】** —— 本机真跑，有原始输出（详见 `06-机制验证报告.md`）
> - **【推定】** —— 由代码逻辑推断，未直接验证
> - **【未查到】** —— 查过但没找到，进 §9 清单

被分析的版本：**Recordly v1.4.0-beta.1**（`Recordly/package.json:15`），检查点见 `06`。

---

## 1. 任意 MP4 能否进 Recordly —— 能

**【已读源码确认】** 这不是猜测，源码里没有任何"必须由 Recordly 录制"的限制。

### 1.1 唯一的导入通道

`Recordly/electron/ipc/register/captions.ts:15`

```ts
const VIDEO_FILE_EXTENSIONS = ["webm", "mp4", "mov", "avi", "mkv"];
```

`Recordly/electron/ipc/register/captions.ts:23-80` 的 `open-video-file-picker` 会弹文件选择框，
选中后只做两件事：

```ts
approveUserPath(selectedPath);      // 加入可读白名单
setCurrentProjectPath(null);        // 丢弃当前项目
return { success: true, kind: "media", path: selectedPath, extension: ... };
```

`Recordly/electron/ipc/utils.ts:124-127` 的 `approveUserPath` 只是
`approvedLocalReadPaths.add(path.resolve(filePath))`，**没有任何来源校验**。

### 1.2 三个 UI 入口（都落在同一个 IPC 通道）

| # | 入口 | 源码位置 | 界面文案 |
|:--:|:---|:---|:---|
| 1 | 启动窗口 → 打开视频文件 | `src/components/launch/popovers/MorePopover.tsx:98-106` → `useLaunchWindowActions.ts:21-32` | 「打开视频文件」/ "Open video file" |
| 2 | 编辑器 → 项目浏览器 → Import | `ProjectBrowserDialog.tsx:183-190` → `useProjectOpenActions.ts:91-142` | "Import" |
| 3 | 设置 → 摄像头素材上传 | `SettingsPanel.tsx:1705-1722` | —— |

入口 2 的动作序列值得记下（`Recordly/src/components/video-editor/project/useProjectOpenActions.ts:91-142`）：

```ts
await window.electronAPI.setCurrentVideoPath(sourcePath, { preserveProjectPath: false });
project.setCurrentProjectPath(null);
resetSourceScopedEditorState();          // ← 关键：清空上一个素材的编辑器状态
toast.success("Media imported");
```

### 1.3 会话解析对非 Recordly 素材的兜底

`Recordly/electron/ipc/register/project.ts:625-669` 的 `set-current-video-path`：

```ts
const resolvedSession = (await resolveRecordingSession(currentVideoPath)) ?? {
  videoPath: currentVideoPath!, webcamPath: null, timeOffsetMs: 0,
};
```

**外来的 MP4 没有 `.recordly-session.json` 侧车，走到 `??` 兜底，不报错。** 这条很关键：
它说明 Recordly 对"野生素材"是有意兼容的。

**【实测】** `rlex project new --video <任意 mp4>` 生成了项目，`rlex export run` 真机出片成功
（`06`§2）。**导入路径与导出路径都验证过了。**

---

## 2. `.recordly` 项目契约

### 2.1 版本与最小可加载结构

**【已读源码确认】**

`Recordly/src/components/video-editor/projectPersistence.ts:85`

```ts
export const PROJECT_VERSION = 2;
```

数据结构（`projectPersistence.ts:169-174`）：

```ts
export interface EditorProjectData {
	version: number;
	projectId?: string;
	videoPath: string;
	editor: Partial<ProjectEditorState>;
}
```

校验函数（`projectPersistence.ts:346-354`）只查四个键：`version` 是数字、`projectId` 可选字符串、
`videoPath` 是非空字符串、`editor` 是对象。主进程侧 `electron/ipc/project/manager.ts:406-427`
的 `isLoadableProjectData` 判据一致（多加一条 `!Array.isArray(editor)`）。

**运行时还有一条 schema 之外的硬要求**（`manager.ts:180-207`）：
`resolveProjectMediaSources` 会 `await fs.access(normalizedVideoPath, fsConstants.F_OK)`，
失败即报 `Project video file not found: <path>`。

> **最小可加载项目 =**
> ```json
> { "version": 2, "videoPath": "<存在的文件路径或 file:// URL>", "editor": {} }
> ```
> `editor: {}` 是安全的 —— `normalizeProjectEditor`（`projectPersistence.ts:356-1137`）
> 会把每个缺失字段填上默认值。`version < 2` 会触发旧 `borderRadius` 单位换算
> （`src/components/video-editor/project/useProjectLifecycle.ts:88-97`）。

**这一条是本工具成立的技术基石：外部程序可以直接写一个合法的 `.recordly`，不需要 IPC、不需要 GUI。**

### 2.2 字幕数据契约

**【已读源码确认】** `Recordly/src/components/video-editor/types.ts:546-594`

```ts
interface CaptionCue {
  id: string; startMs: number; endMs: number; text: string;
  words?: CaptionCueWord[];      // { text, startMs, endMs, leadingSpace? }
}

interface AutoCaptionSettings {
  enabled: boolean;
  timelineQuickAdd: boolean;
  language: string;
  fontFamily: string;            // ⚠ 见 §2.3
  fontSize: number;              // 16..72
  bottomOffset: number;          // 0..30 (%)
  maxWidth: number;              // 40..95 (%)
  maxRows: number;               // 1..4
  animationStyle: "none" | "fade" | "rise" | "pop";
  boxRadius: number;             // 0..40
  textColor: string;
  inactiveTextColor: string;
  backgroundOpacity: number;     // 0..1
}
```

归一化规则的要点（`projectPersistence.ts:711-818`）：

- cue 按 `typeof cue.id === "string"` 过滤；时间取整；`endMs >= startMs + 1`
- **`text` 为空的 cue 会被丢弃**
- 上面的取值范围是在归一化里 **clamp** 的，超出不会报错、会被夹取

### 2.3 ⚠ `fontFamily` 是唯一被强制重置的字段

**【已读源码确认】** `Recordly/src/components/video-editor/projectPersistence.ts:785`

```ts
const normalizedAutoCaptionSettings: AutoCaptionSettings = {
  enabled: ...,
  // ...
  fontFamily: getDefaultCaptionFontFamily(),   // ← 不读 rawAutoCaptionSettings.fontFamily
  fontSize: ...,
```

而默认字体栈（`Recordly/src/components/video-editor/types.ts:450-452`）：

```ts
export function getDefaultCaptionFontFamily() {
	return '"SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif';
}
```

**全是拉丁字体，不含任何 CJK 字体。** 中文字幕会走浏览器/系统的 CJK 兜底字体。

**【实测】** 我构造了一个 `fontFamily: '"SimSun", serif'` 的项目送进 `normalizeProjectEditor`，
输出被改回默认值；同一批测试里其余 12 个字段**全部原样保留**（`06`§3）。

**双重封锁**：CLI 也只把它当未知字段 ——
`rlex project validate` 会输出
`[!] 未知字段 editor.autoCaptionSettings.fontFamily`（`06`§3）。

> **结论：不修改 Recordly 源码，字体就不可控。** 这是本方案唯一的硬缺口，
> 取舍见 `03-决策_ADR.md` ADR-04。

### 2.4 为什么 `.recordly` 不能当唯一事实源

**【实测】** `rlex project patch` 明确拒绝数组字段：

```
$ rlex project patch t.recordly --set 'editor.autoCaptions[0].text=hello'
[X] 未知字段 editor.autoCaptions[0].text: 字段不在 .recordly v2 白名单里
$ rlex project patch t.recordly --set 'editor.autoCaptions=[]'
[X] editor.autoCaptions 是数组字段，本版不支持用 --set 赋值
```

字幕条是数组，**命令行灌不进去**。所以工具有两个选择：自己写 JSON（可行，§2.1 已证），
或者让项目里保一份 `captions.srt` 作为人机都好读写的权威副本。

**本方案两个都做**：`captions.srt` 是人机接口，`.recordly` 是渲染产物（见 `02-方案` §4）。

---

### 2.5 ⚠⚠ 交接面的三个致命机制（本轮最重要的发现）

这三条直接决定工具能不能做"AI 写完交给人、人改完交回 AI"。**不处理这三条，交接一定会丢数据。**

#### 2.5.1 Save 原地覆盖 —— 好消息

**【已读源码确认】** `Recordly/src/components/video-editor/project/useProjectSaveActions.ts:100-112`

```ts
let targetPath = forceSaveAs ? undefined : (currentProjectPath ?? undefined);
if (!forceSaveAs && !targetPath) {
  const activeProject = await window.electronAPI.loadCurrentProjectFile();
  if (activeProject.success && activeProject.path) { targetPath = activeProject.path; ... }
}
```

主进程写回**同一个路径**（`electron/ipc/register/project.ts:332-346`，原子写，
旧版本留在 `<project>.recordly.bak`）。**只有路径不可信时才弹另存为。**

> ✅ 所以"人打开的就是 AI 的文件"这一条成立 —— **交接机制在文件层面是通的。**

#### 2.5.2 ⚠ 1 秒自动保存 —— 最大的数据风险

**【已读源码确认】** `useProjectSaveActions.ts:7` 与 `:176-191`

```ts
const PROJECT_AUTOSAVE_DELAY_MS = 1_000;
// 只要 dirty 且已有路径，1 秒后就静默覆盖文件
{ captureThumbnail: false, remountPreviewAfterSave: false, refreshLibraryAfterSave: false }
```

**【已读源码确认】** 全仓 `grep fs.watch|chokidar|watchFile|FSWatcher` 在 `electron/` 与 `src/` → **0 命中**。
无文件监听、无 mtime 冲突检测（`mtimeMs` 只用于 UI 排序，`manager.ts:354`）。

> ⚠️ **推论（危险）**：如果人在 GUI 里打开了项目，**AI 这时改写磁盘上的 `.recordly` 会被静默冲掉** ——
> GUI 不会察觉磁盘变化，人的下一次编辑触发 1 秒自动保存，把 GUI 内存里的整份快照写回去
> （last-writer-wins）。**且没有任何"文件已在磁盘上被改动"的提示。**
>
> **这是本方案必须显式设计的并发控制场景**，见 `03-决策_ADR.md` ADR-03 与 `02-方案` §6.2。

#### 2.5.3 ⚠ 往返是双向有损的

**【已读源码确认】** 归一化里**完全不读输入**的字段（不只是 `fontFamily`）：

| # | 字段 | 行号 | 说明 |
|:--:|:---|:---|:---|
| 1 | `autoCaptionSettings.fontFamily` | `:785` | → 默认字体栈 |
| 2 | `zoomSmoothness` | `:955` | → `DEFAULT_ZOOM_SMOOTHNESS` |
| 3 | `cursorMotionBlur` | `:958` | → `DEFAULT_CURSOR_MOTION_BLUR` |
| 4 | `exportPipelineModel` | `:1112` | 恒为 `"modern"`（`normalizeExportPipelineModel(_value)` 形参就叫 `_value`） |
| 5 | `zoomMotionBlurTuning.*`（7 个子字段） | `:389-417` | 输入在进归一化前就被 `stripPersistedDevMotionBlurSettings` 删掉 |

**【已读源码确认】** 更隐蔽的一条：**9 个光标运动字段会被"塌缩"到预设**。
`resolveCursorMotionPresetId`（`cursorMotionPresets.ts:86-91`）对 9 个值做**精确相等**匹配，
不中就落到 `"focused"` 预设；而归一化**先按输入算好、再在返回对象里用预设值覆盖**
（`:919-960`）。

> ⚠️ **实际后果**：人只要动了自由滑块的 `cursorSize`（`SettingsPanel.tsx:3293-3303`，
> `min=0.5 max=10 step=0.05`），9 个字段会**一起跳回 `focused` 预设值**。
> 现场证据：`recordly-export-master/samples/input/demo-golden.recordly:30-31` 写的是
> `cursorSize: 2.8, cursorSmoothing: 0.7`，下次加载会变成 `2.5 / 0.67`。

**【已读源码确认】** 第三条：**GUI 保存时发出的是一个固定字段清单**
（`useProjectSnapshotModel.ts:74-140`，手写对象而非回写原文件）。

> ⚠️ **推论**：任何不在这个清单里的 AI 字段，**只要人在 GUI 里保存过一次就会消失** ——
> 即使它能挺过加载归一化。

**【已读源码确认】** 还有一条：**项目绑定机器**。`videoPath`、`webcam.sourcePath`、
`audioRegions[].audioPath` 都是**绝对路径**，全仓没有任何相对路径或重写逻辑。
且 `resolveProjectMediaSources`（`manager.ts:180-239`）在视频缺失时**直接拒绝加载**：
`Project video file not found: <path>`。

> ⚠️ **连带**：**光标轨迹根本不在项目里** —— 它在 `<videoPath>.cursor.json` 侧车
> （`utils.ts:66-68`）。只拷 `.recordly` 会丢掉缩放与点击效果。

---

## 3. 无头导出通道

### 3.1 全部 18 个环境变量

**【已读源码确认】** 门的开关在 `Recordly/electron/main.ts:63`：

```ts
const IS_SMOKE_EXPORT = process.env.RECORDLY_SMOKE_EXPORT === "1";
```

变量到窗口查询串的翻译在 `Recordly/electron/windows.ts:60-113`。完整清单：

| # | 变量 | 作用 |
|:--:|:---|:---|
| 1 | `RECORDLY_SMOKE_EXPORT` | 总开关，必须为 `"1"` |
| 2 | `..._INPUT` | 输入视频 |
| 3 | `..._OUTPUT` | 输出路径 |
| 4 | `..._USE_NATIVE` | `"1"` 走原生通道 |
| 5 | `..._ENCODING_MODE` | fast / balanced / quality |
| 6 | `..._SHADOW_INTENSITY` | 阴影强度 |
| 7 | `..._WEBCAM_INPUT` | 摄像头素材 |
| 8 | `..._WEBCAM_SHADOW` | 摄像头阴影 |
| 9 | `..._WEBCAM_SIZE` | 摄像头尺寸 |
| 10 | `..._PIPELINE` | modern / legacy |
| 11 | `..._BACKEND` | auto / webcodecs / breeze |
| 12 | `..._RENDER_BACKEND` | webgl / webgpu |
| 13 | `..._MAX_ENCODE_QUEUE` | 背压 |
| 14 | `..._MAX_DECODE_QUEUE` | 背压 |
| 15 | `..._MAX_PENDING_FRAMES` | 背压 |
| 16 | `..._PROJECT` | **项目文件**（本方案主用） |
| 17 | `..._QUALITY` | medium / good / high / source |
| 18 | `..._FPS` | 24 / 30 / 60 |

渲染侧消费者：`Recordly/src/components/video-editor/smokeExportConfig.ts:72-137`。

### 3.2 报告产物

**【已读源码确认】** `Recordly/src/components/video-editor/export/exportPersistence.ts:130-149`

```ts
export async function writeSmokeExportReport(outputPath: string | null, report) {
  ...
  await window.electronAPI.writeExportedVideoToPath(reportBuffer, `${outputPath}.report.json`);
}
```

即 `<输出>.mp4.report.json`。**这是公开接口契约**（`recordly-export-master/AGENTS.md:79` 明确认可），
允许被外部工具读取与依赖。

自动开跑：`Recordly/src/components/video-editor/export/useSmokeExportAutomation.ts:54-107`，
`SMOKE_EXPORT_READY_TIMEOUT_MS = 30_000`，跑完 `window.close()`。

> **重要推论：一次应用启动只跑一次导出。** 源码里没有"循环导出多个项目"的能力。
> 这对"模板试穿"的成本有直接后果 —— 见 `02-方案` §7。

### 3.3 导出走哪条路

**【已读源码确认】** `Recordly/src/lib/exporter/backendPolicy.ts:59-147` 的三路由决策
（`native-static-layout` / `breeze-stream` / `webcodecs`）：

- `backendPreference === "webcodecs"` → 直接 webcodecs
- `backendPreference === "breeze"` → 优先 native-static-layout，不行退 breeze-stream
- `backendPreference === "auto"` 且平台是 win32/darwin → **breeze-stream**，webcodecs 兜底

**【已读源码确认】** 字幕会关掉原生 static 通道 —— `modernVideoExporter.ts:1563-1565`：

```ts
if ((this.config.autoCaptions ?? []).length > 0) {
    reasons.push("unsupported-caption-overlay");
}
```

但因为 Windows 上 `auto` 默认就走 `breeze-stream`（`backendPolicy.ts:117-134`），
**只有用户显式选 `breeze` 时这条才有实际损失**。

---

## 4. 渲染管线：预览与导出是两套代码

**【已读源码确认】** 这是加模板时最大的成本来源。

| 维度 | 预览 | 导出 |
|:---|:---|:---|
| 载体 | React DOM + 内联 CSS | Canvas2D |
| 入口 | `VideoPlayback.tsx:2569-2645` | `captionRenderer.ts:18-107`（传统）<br>`modernFrameRenderer.ts:1616-1813`（现代） |
| 字体解析 | 硬编码默认字体栈（`:2605`, `:625`） | 现代路径读 `settings.fontFamily`（`:1638`）；传统路径**也硬编码**（`captionRenderer.ts:33`） |
| 缩放基准宽 | `clientWidth \|\| 960`（`:608`） | `config.width` |
| 盒子几何 | DOM 自动布局，读 `offsetWidth/Height`（`:757-792`） | 数值计算 |
| 圆角 | DOM `border-radius` + SVG `clip-path` squircle | `drawSquircleOnCanvas()` |

**后果**：每加一个模板要写两遍，且"预览好看"不等于"导出一样"。
合并这两条路径是 C 档的核心工作（见 `02-方案` §8）。

### 4.1 光栅缓存：好消息

**【已读源码确认】** `Recordly/src/lib/exporter/modernFrameRenderer.ts:1674`

```ts
key: `${layout.blockKey}:${layout.visiblePageIndex}:${layout.activeWordIndex}`,
```

`:1794-1803` 只在 key 变化时重光栅；透明度/位移/缩放作用在 **Sprite 变换**上
（`:1811-1813`），**不重新光栅**。

> **所以现有的 4 个整块动画几乎零成本。** 这是很好的设计，也是逐字动画会破坏的东西
> （每个字独立动 → 每帧 key 都变 → 每帧重光栅）。见 `02-方案` §8。

### 4.2 一个既有缺陷：`enabled` 在两条导出路径里语义不一致

**【已读源码确认】**（本轮自行核对）

```ts
// 传统路径 captionRenderer.ts:26
if (!settings.enabled || cues.length === 0) { return; }

// 现代路径 modernFrameRenderer.ts:1617
if (!this.config.autoCaptions?.length || !this.config.autoCaptionSettings) { return; }
```

传统路径看 `enabled`，现代路径**不看**。`enabled:false` + 有字幕条时两条路结果不同。
**【推定】** `enabled` 更像 UI/转写开关，而非渲染门控。

---

## 5. 字幕布局引擎：性能特征与规模风险

### 5.1 每帧全量重算

**【已读源码确认】** `modernFrameRenderer.ts:1781-1782` → `buildCaptionRenderState(timeMs)`
→ `buildActiveCaptionLayout({cues, ...})`，而后者第一件事是
`flattenCaptionWords(options.cues)`（`captionLayout.ts:442`）—— **遍历全部字幕条**。

没有时间窗口裁剪，没有记忆化。另外 `isWithinCaptionCoverage`（`captionLayout.ts:136-153`）
每次调用都 `[...cues].sort(...)`，即每帧排序一次全表。

> **成本 ∝ 总条数 × 总帧数 ∝ 时长²。**

### 5.2 中文为什么落在便宜的口径

**【已读源码确认】** `Recordly/electron/ipc/captions/parser.ts:44-70`

```ts
const parts = tokenText.match(/\s+|[^\s]+/g) ?? [];
// 空白 → nextLeadingSpace = true
// 没有前一个词 或 nextLeadingSpace → 新开一个词
// 否则 → previousWord.text += part    ← 关键：往后拼
```

**没有空白就往前一个词里拼。中文没有词间空格 → 整段中文并成一个词。**

**【实测】** 在 163 条中文语料上：文本型 **489** 次 `measureText`/帧；若按每帧 1630 个词
则 **4888** 次/帧 —— **约 9 倍差**。所以中文的实际成本是低的那一档（`06`§5）。

> **这条要写进代码注释**：将来若给中文加真正的分词，成本会跳 9 倍。

---

## 6. 内容文档（D2）能落到哪

### 6.1 标注（annotation）是候选落点

**【已读源码确认】** `Recordly/src/components/video-editor/types.ts:454-470`

```ts
export interface AnnotationRegion {
  id: string; startMs: number; endMs: number;
  type: AnnotationType;
  content: string;              // 旧字段
  textContent?: string;
  imageContent?: string;        // ← 图片（data URL）
  position: AnnotationPosition; // { x, y } 百分比
  size: AnnotationSize;         // { width, height } 百分比
  style: AnnotationTextStyle;
  zIndex: number;
  trackIndex?: number;
  figureData?: FigureData;
  blurIntensity?: number; blurColor?: string;
}
```

**可以放图片，且有位置/尺寸/层级** —— 形态上适合"把文档页放进画面"。

**【已读源码确认】** 图片必须是 **inline 的 `data:` URL，且没有任何尺寸上限**：

- 字段：`AnnotationRegion.imageContent`（`types.ts:461`），同时镜像进旧字段 `content`
  （`useAnnotationRegionCommands.ts:95-97`）
- 生产端：`AnnotationSettingsPanel.tsx:105-139` 只校验 MIME
  （`image/jpeg|jpg|png|gif|webp`，`:112-119`），然后 `reader.readAsDataURL(file)`（`:137`）。
  **全仓 `grep file\.size|MAX_.*SIZE|sizeLimit` → 没有任何体积检查**
- 消费端：`annotationRenderer.ts:51-58`

```ts
const source = annotation.imageContent || annotation.content;
if (!source || !source.startsWith("data:image")) return null;
```

> ⚠️ **两个硬后果：**
> 1. **外部工具不能给一个文件路径** —— 必须把图 base64 内联进 JSON。一页 1080p PNG 约 1–3 MB，
>    base64 膨胀 ~33% → 每页 1.4–4 MB。**10 页就是 40 MB 的 JSON**，而 Recordly 会整体读进内存。
> 2. **没有上限意味着也没有保护** —— 工具侧必须自己限幅（缩页 + 转 JPEG），见 `02-方案` §5.3。

**【已读源码确认】** 位置/尺寸是**画面百分比**（`annotationRenderer.ts:384-387`）：

```ts
x: annotationRect.x + (annotation.position.x / 100) * annotationRect.width,
width: (annotation.size.width / 100) * annotationRect.width,
```

归一化里 `position` clamp 到 **0..100**，`size` clamp 到 **1..200**（`projectPersistence.ts:623-654`）。
`AnnotationType = "text" | "image" | "figure" | "blur"`（`types.ts:403`）。

> ⚠️ 另一个坑：`style` 与 `figureData` 是**整对象展开覆盖默认值，无逐字段校验**
> （`projectPersistence.ts:655-667`）—— 写错一个字段不会被拦，只会静默生效或变形。

**【已读源码确认】** 文本样式（`types.ts:434-444`）比字幕丰富得多，**包含 `fontFamily`**：

```ts
export interface AnnotationTextStyle {
  color, backgroundColor, fontSize, fontFamily,
  fontWeight, fontStyle, textDecoration, textAlign, borderRadius
}
```

> **一个重要的旁证**：`AnnotationTextStyle` 走的是**另一套归一化**，
> 而 `AnnotationSettingsPanel.tsx:227-257` 里**有字体下拉与自定义字体选择**。
> 也就是说 **Recordly 在标注上是支持换字体的，只有字幕不支持。**
> 这说明字体能力在工程上是现成的，字幕侧的缺失更像是遗漏而非设计。
> 【推定】这提高了提上游 PR 的把握（ADR-04）。

### 6.2 文档转图的能力（工具侧，非 Recordly）

**【实测】** 本机能力探测：

| 工具/库 | 状态 | 用途 |
|:---|:---:|:---|
| **PyMuPDF (`fitz`)** | ✅ 可用 | **PDF → 逐页 PNG**（最干净的路） |
| Pillow (`PIL`) | ✅ 可用 | 图像处理、拼对比图 |
| `python-docx` / `python-pptx` | ✅ 可用 | DOCX/PPTX 读取 |
| `pandoc` | ✅ `D:\tools\pandoc-3.7.0.2\pandoc.exe` | Markdown ↔ HTML/DOCX |
| `ffmpeg` | ✅ 9.0.1 | 抽帧、拼图、合成 |
| LibreOffice / `soffice` | ❌ 无 | DOCX/PPTX **光栅化**缺失 |
| WeasyPrint | ❌ 导入失败 | HTML → PDF/PNG 缺依赖 |

> **结论：PDF 路线是一等公民**（`fitz` 直接出页图）；
> **DOCX/PPTX 只能取文本/结构，不能本地光栅化** —— 要走 `documents2md` / `pptx-creator` 技能族，
> 或先转 PDF。这条限制必须写进方案（`02-方案` §5）。

---

## 7. Recordly 没有的东西（决定了工具形态）

| 缺什么 | 证据 | 后果 |
|:---|:---|:---|
| **对外 API / WebSocket** | `WebSocket`/`ws://` 在 `*.ts` 中 0 命中；`express` 0 命中 | 不能把 Recordly 当服务调用 |
| **CLI** | `package.json` 无 `bin` 键；`electron/` 无 argv 解析 | Recordly 本体不能被脚本直接驱动 |
| **可用的外部 HTTP 接口** | `mediaServer.ts` 仅 `GET /video?path=`，鉴权是**路径白名单**（`:85-91`），端口随机；`rendererServer.ts` 只服务静态 `dist/` | 外部进程拿不到有用的能力 |
| **IPC 外部可达** | `contextIsolation: true`，preload 只注入应用窗口 | 同上 |
| **从任意 mp4 新建项目的一键函数** | `grep newProject` 在 `src/` 0 命中；`createProjectData` 只在 load/save 里被调用 | **必须由我们的工具写 JSON** |
| **字幕字体可控** | `projectPersistence.ts:785` | 见 §2.3 |
| **字幕水平位置** | `AutoCaptionSettings` 无 X 字段；导出 `centerX = width/2` | 想左右挪必须改代码 |
| **逐字动画** | `animationStyle` 只有 4 个整块值；`captionStyle.ts:50-56` 恒返回 `isActive:false` | 需要新能力 |

> **这就是"独立工具是唯一可行形态"的全部依据。** 不是我们偏好独立，是 Recordly 没有可复用的对外面。

---

## 8. AGPL 围栏

`recordly-export-master/AGENTS.md:77-84` 的既有约定，本工具沿用：

**可以复用（公开接口契约）**：

- `.recordly` 的字段名与 `version: 2`
- `RECORDLY_SMOKE_EXPORT*` 环境变量名
- `<输出>.mp4.report.json` 的命名

**不可以**：

- 把 Recordly 源码逐段复制进本工具仓（AGPL 传染）
- 修改 `D:\code\Recordly` 下的源码（保持可跟随上游 `git pull`）

**待确认**：本主题夹本身写在 `D:\code\Recordly\docs\` 下，
而 `recordly-agent-skills-workspace/AGENTS.md:52` 写着"禁止修改 `D:\code\Recordly` 的任何文件"。
**这是用户在本轮明确要求的落点**，属于显式覆盖；但需要在 `05-待确认清单.md` 记录该冲突。

---

## 9. 未查到清单

| # | 未查到 / 未验证 | 说明 |
|:--:|:---|:---|
| 1 | 中文 whisper 输出是否真的并成 1 词/条 | 本机无 Windows whisper 运行时与模型；由 §5.2 的代码逻辑【推定】 |
| 2 | 一次应用启动能否导出多个项目 | §3.2 显示源码是单次导出；未找到批量路径 |
| 3 | 大 `imageContent`（数十 MB JSON）的实际加载表现 | 源码无上限、无保护；**未做压力测试**，见 `05-待确认清单` Q3 |
| 4 | 人在 GUI 里改完，`pull` 能否完整还原其意图 | 已确认字段级丢失清单（§2.5.3），但**未做一次真实的人改→pull 全流程** |
| 5 | 本主题夹放在 `D:\code\Recordly\docs\` 与工作区纪律的冲突如何处置 | 见 `05-待确认清单` Q5 |

> 已在本轮查清、不再列入：`annotationRegions` 归一化与图片上限（§6.1）、
> Save 是否原地覆盖（§2.5.1）、外部改写磁盘文件的行为（§2.5.2）、
> 跨机迁移行为（§2.5.3 末段）。
