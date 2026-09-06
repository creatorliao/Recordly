# 06 · 问题：摄像头面板中英混杂 + 原生 tooltip 粗糙

> 2026-09-06 用户在 beta.9 编辑器侧栏截图。  
> 落点 **G4** 体验，语言范围只修简中 + 英文。

## 现状

摄像头裁剪区标题是「摄像头裁剪 / 重置」，下面却是：

- Position
- Custom position
- Horizontal / Vertical
- Margin

侧栏图标悬停弹出系统原生图贴（白底黑框、无圆角），和界面圆角软阴影不搭。

## 根因

1. `tSettings("effects.webcamPosition", "Position")` 等 key **没写进** `zh-CN/en` 的 `settings.json`，缺 key 就显示英文 fallback。  
2. 全站图标提示走 HTML `title=`，由 Chromium/系统画，无法跟应用皮肤一致。

## 方案（已落地）

- 补齐位置/边距/九宫格方位的中英文案；简中纯中文，英文纯英文。  
- 全站图贴改读 `data-tooltip`，由 `AppTooltipHost` 画暗色圆角浮层。`Button` / `ToggleGroupItem` 的 `title` 自动转过去，不再落到原生 `title`。  
- 播放/暂停硬编码英文一并改走 `editor.playback.*`。

## 怎么验

1. 默认简中：摄像头面板应是「位置 / 自定义位置 / 水平 / 垂直 / 边距」。  
2. 悬停侧栏「光标 / 摄像头」：暗色圆角图贴，不是系统黑框。  
3. 切到 English：同一批词是纯英文。  
4. 不改录→停→编→导步骤。
