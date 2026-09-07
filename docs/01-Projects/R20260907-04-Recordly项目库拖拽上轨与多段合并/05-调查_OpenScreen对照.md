# 05 · 调查：OpenScreen 是否已实现「素材箱 + 拖拽上轨」

> 2026-09-08。对照本地 `D:\code\openscreen`。不改 Recordly 产品代码。  
> 结论先行：**新编辑器（ai-edition / V4）已经做成了类似剪映素材库的能力；Recordly 继承的旧 `video-editor` 没有。不能整包抄过来。**

---

## 一、一句话

| 问 | 答 |
|----|----|
| OpenScreen 有没有「工程内多段素材、拖到时间轴、导出成一条」？ | **有。** 在 **ai-edition**（顶栏 Media / Edit / Rec），官方文档写得很清楚 |
| Recordly 现在用的那套编辑器，OpenScreen 里还有没有同样能力？ | **没有。** 旧 `src/components/video-editor` 仍是单 `videoPath`，和本仓同一模型 |
| 本仓有没有 ai-edition？ | **没有。** 全库搜不到 `AxcutAsset` / `MediaStage` / `ai-edition` |
| 能不能抄过来？ | **不能当补丁抄。** 那是换编辑器引擎（约 7.2 万行 + 原生合成器 + schema v7），过不了 `AGENTS.md` 换引擎 / >2000 行闸门 |
| 这轮做了什么 | 只记本文。**产品代码未改** |

---

## 二、OpenScreen 新编辑器：已经实现了什么

真源：

- 用户文档：`website/docs/media-library.md`、`editing-timeline.md`、`recording.md`
- 架构：`technical-documentation/architecture/document-model.md`、`timeline-model.md`
- UI：`src/components/ai-edition/v4/MediaStage.tsx`
- 模型：`src/lib/ai-edition/schema/index.ts`（`axcutSchemaVersion = 7`）

官方原话（`media-library.md`）：

> A project isn't one recording — it's a set of sources and an ordered list of clips cut from them.  
> Importing a source does *not* put it on the timeline. Drag its card onto the clip row to do that.

| 能力 | OpenScreen ai-edition | 和本夹需求的对应 |
|------|----------------------|------------------|
| 工程内 `assets[]`（多源） | 有。导入 / 录制先进箱 | = 本夹「素材箱」 |
| 导入不上轨 | 有。`addAsset` 只加源 | = 场景 C |
| 卡片可拖 | `draggable` + `application/x-axcut-asset` | = 拖拽上轨 |
| 「加入时间轴」按钮 | `addToTimeline` | = 菜单保底 |
| clip 带 `assetId` + 源 in/out + 轴起止 | `clipSchema` | = 本夹 C2 多源 clip |
| 拖到已有 clip 上：前 / 后 / 切开插入 | 文档写明 | 本夹第一期未纳入（可后做） |
| 轴上片段连续、无缝 | 删除/换序会收拢 | = 本夹「自动靠拢」 |
| 删 clip 源仍在箱里 | 有 | = `04` 走查 |
| 混分辨率信箱 | 文档：16:9 + 9:16 可同轴 | = 代决 M-E |
| 缩放等效果跟 clip 走 | v5 起 clip-anchored | 比本夹第一期更完整 |
| 顶栏 Media / Edit / Rec 三模式 | 有 | Recordly 没有这套壳 |
| 停录进编辑器 | `importPendingRecording`：**新建一份工程** + `addAsset`，不是往当前课追加 | ≠ N5「追加到当前时间轴」 |

Rec 模式（`recording.md`）：编辑器里开录 → 关编辑器开 HUD → 停录后 **新开一份工程** 装这段。多段拼课要再进 Media 导入或拖。文档写：「或到 Media library 去拼几次 take。」

体量（本机 `find` + `wc`，2026-09-08）：

| 范围 | 数量 |
|------|------|
| `src/lib/ai-edition` + `src/components/ai-edition` + `electron/ai-edition` | **237** 个 ts/tsx，约 **72 420** 行 |
| 另绑：`src/native` 合成器、`timelineMap`、多 clip 导出、schema 迁到 v7 | 不在上数里，但预览/导出离不了 |

---

## 三、OpenScreen 旧编辑器：和 Recordly 一样，没有

`openscreen/src/components/video-editor/projectPersistence.ts` 仍是：

```ts
export interface EditorProjectData {
	version: number;
	media?: ProjectMedia;
	editor: ProjectEditorState;
	videoPath?: string;   // 单数，可选
}
```

没有 `assets[]`，没有 Media 模式，没有「拖卡片上正片轨」。  
Recordly 的 `EditorProjectData` 是同一条血：`videoPath: string` + 剪切型 `ClipRegion`。

本仓编辑器是这条旧树的移植，**不是** OpenScreen 后来换上去的 V4。

---

## 四、为什么不抄（问题，已按你的口径停手）

你说「已经实现了就抄过来」。对照之后：**产品形态在 OS 新栈里实现了，但抄的对象不是一个功能补丁，是整台编辑器。**

| 若整包搬 ai-edition | 会怎样 |
|---------------------|--------|
| 换文档模型 | `.recordly` v2 → `AxcutDocument` v7；旧课、Portable、GPU 导出全要迁或双开 |
| 换预览 | 单 `<video>` → 原生 compositor + `timelineMap` 三套时间 |
| 换壳 | 左轨项目格子 → Media/Edit/Rec + AI agent |
| 行数 | 远超 2000；`AGENTS.md`：**换引擎基本拒绝** |
| G4 / 原则 2 | 不过度设计；培训师金路径会被换成另一套软件 |
| 你上一轮 | 方案未确认、不改产品代码 |

因此：**没有抄。** 可借鉴的只有口径和交互清单（见下），不是文件级 cherry-pick。

---

## 五、可以从 OpenScreen **借鉴、不能搬代码** 的清单

给本夹 `03` 当对照，不引入 OS 文件：

| 借鉴 | 不要搬 |
|------|--------|
| 「工程 = 一组源 + 一组 clip」这句话 | `AxcutDocument` / Zod schema v7 |
| 导入不上轨；拖卡片才上轨 | `MediaStage.tsx` 整页（还绑转写、AI、三模式） |
| 删轴上片段、源留在箱里 | `timelineMap` / 原生合成器 |
| 混分辨率靠工程画布 fit | Rec 关窗、agent、13 语、Full Camera |
| 拖到已有块上的「前/后/切开」作为**后期** | 停录必新建工程（和本仓 N5 口径相反） |

本夹方案（`03`）与 OS Media 库对齐的部分保持；**不**改成「先换 V4 再谈素材箱」。

---

## 六、对值不值得的修正

`02` 写「本仓没有 stitch / 素材箱」仍然对。  
补一句：开源上游**后来**用另一套编辑器做成了；对我们是**参照物**，不是可合并的 PR。

N5「编辑中再录、接到当前轴」：OS Rec 也**没有**做成「不停课追加」。两边都缺这一入口。素材箱和 N5 仍要本仓自己做（或按 `03` 分期）。
