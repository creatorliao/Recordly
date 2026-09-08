# 调查：光标页英文提示「Cursor spring tuning…」

调查日：2026-09-08。对照用户截图（光标摆动下灰框英文）。

## 用户看到的字

界面上是：

> Cursor spring tuning is available in Settings > Dev.

不是「These courses being turning…」——那是听错/看错；原文是 **Cursor spring**（光标弹簧）**tuning**（调参）。

## 是不是有东西没展示出来？

**不是渲染坏了，是故意藏起来的开发者控件。**

| 项 | 事实 |
|----|------|
| 「光标摆动」滑条 | 正常，培训师日常用的摆动强度 |
| 灰框英文 | 仅 `import.meta.env.DEV === true` 时出现（`showDevMotionControls`） |
| 弹簧刚度 / 阻尼 / 质量 | 不在「光标」页；在左下角**齿轮 → Settings → Dev** 分区 |
| 正式安装包 | 一般无 Dev 分区，也无这条提示 |

源码锚点：`SettingsPanel.tsx` 约 1261（`showDevMotionControls`）、3522–3530（提示）、2733+（Dev 区真控件）。

## 为什么中文界面仍是英文？

键名 `effects.cursorDebugMovedToDev` **没有**写进 `en`/`zh-CN` 的 `settings.json`，`tSettings` 落到代码里的英文 fallback。所以不是「半截没翻完」，是**整句从未进词条**。

## 对培训师的影响

- 看起来像功能坏了或内容被裁切。  
- 「Settings > Dev」对录课用户无意义（开发调试用）。  
- 日常成片只需要「光标摆动」；精细弹簧调参不在金路径上。

## 处理（已做）

从**光标页**去掉这条提示。Dev 区滑条仍只在开发构建的齿轮设置里，给开发者用；培训师光标页只留摆动等日常控件。
