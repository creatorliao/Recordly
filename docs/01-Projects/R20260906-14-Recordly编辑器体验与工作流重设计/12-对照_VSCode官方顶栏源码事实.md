# 12 · 对照：VS Code 官方顶栏源码事实

> 本地仓：`D:\code\vscode`（sparse + `--depth 1`，**不属于 Recordly 仓库**）。  
> 远程：https://github.com/microsoft/vscode  
> 钉死提交：`3d7cfab6d77dce362755ac573a7a350e8f64528f`（`3d7cfab`）  
> 许可证：MIT（Microsoft）。抄 CSS/结构时在我们文件头注明来源路径 + 该 SHA。  
> **数字与结构只认本页引用的源码，不再用截图目测、不再另做验证。**

施工时打开这些文件对着抄，不要凭记忆改数字。

---

## 1. 条有多高（官方常量，不是目测）

`src/vs/platform/window/common/window.ts`：

```ts
export const DEFAULT_CUSTOM_TITLEBAR_HEIGHT = 35; // includes space for command center
```

`src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` `minimumHeight`：

```ts
let value = this.isCommandCenterVisible || wcoEnabled ? DEFAULT_CUSTOM_TITLEBAR_HEIGHT : 30;
```

| 条件 | 高度 |
|------|------|
| 无 Command Center（我们不要命令中心） | **30** |
| 有 Command Center / WCO | **35** |

**我们抄 30。** 上一稿「约 30–35」作废。

Windows / Linux / Web 容器：`line-height: 22px`（`titlebarpart.css`）。

---

## 2. DOM 结构（抄这个，不要自己发明三栏算法）

`titlebarpart.css` + `titlebarPart.ts` 的容器：

```
.part.titlebar
  .titlebar-container
    .titlebar-drag-region          /* 整条可拖，-webkit-app-region: drag */
    .titlebar-left
      .window-appicon              /* 宽 35px；图标 16px 居中 */
      .menubar                     /* z-index 2500；min-width 36px */
    .titlebar-center               /* 有标题时：order 1，宽约 60% */
      .window-title                /* font-size 12px */
    .titlebar-right
      .action-toolbar-container    /* 布局钮等；padding-right 4px */
```

有中栏时：左 20% + 中 60% + 右 20%，中栏 `margin: 0 10px`。  
我们有课名，走 **has-center** 这一套。

---

## 3. 菜单钮（抄 CSS，不搬整个 Monaco `MenuBar` 类）

`src/vs/base/browser/ui/menu/menubar.css`：

| 量 | 官方 |
|----|------|
| `.menubar-menu-title` | `padding: 0 8px`；`border-radius: 5px` |
| overflow「更多」 | 22×22，左右垫 8px |
| 菜单条 | `height: 100%`；`flex-shrink: 1` |

`menubarControl.css`：hover/open 用 `menubar.selectionBackground` / `selectionForeground` / `selectionBorder`（虚线 1px hover，实线 1px open）。

顶栏菜单注册：`menubar.contribution.ts`（`&&` = 快捷字母）：

| order | 英文源串 | 我们抄不抄 |
|-------|----------|------------|
| 1 | `&&File` | **抄样式与「文件」槽**，内容换成我们已有动作 |
| 2 | `&&Edit` | **抄**，内容 = 撤销/重做 |
| 3 | `&&Selection` | 不抄（没有选择子系统） |
| 4 | `&&View` | 不抄为查看全家桶；预设可挂这里或独立文字「预设」 |
| 5 | `&&Go` | 不抄 |
| 7 | `&&Terminal` | 不抄 |
| 8 | `&&Help` | 不抄 |
| 9 | `&&Preferences` | 仅 mac 原生；我们设置仍在设置页 |

「运行」不在这份 contribution 里（调试扩展另挂），**不抄**。

文件菜单能力（`fileActions.contribution.ts` 等）官方有 New / Open / Save / Save As / Close。我们只把**已经存在**的动作填进 `文件`：返回录制、从文件新建、打开项目、保存、另存。不抄「全部保存 / 自动保存 / 还原文件 / 关闭编辑器」除非产品里已有。

---

## 4. 其它官方数（抄得到就抄）

| 项 | 官方 | 我们 |
|----|------|------|
| 应用图标槽 | 宽 35px，背景图 16px | 可用 Recordly 小标，同尺寸 |
| 工具条 gap | `gap: 4px` | 抄 |
| 无中栏时右栏 | `padding-left: 16px` | 有课名则走 has-center |
| 失活整条 | `opacity: 0.6` | 抄（窗口失焦） |
| 窗控按钮 | 宽 46px、字 16px | **不抄**：Electron 原生窗控已经在 |
| Command Center | 高 22、圆角 medium、宽 38vw | **不抄** |
| compact 菜单塞进活动栏 | 有 | **不抄** |

颜色令牌（映射到我们已有 CSS 变量，不引入整套 `--vscode-*`）：

- `titleBar.activeForeground` / `inactiveForeground`
- `titleBar.activeBackground` / `inactiveBackground`
- `menubar.selectionBackground` / `selectionForeground` / `selectionBorder`

---

## 5. 施工抄哪些文件（对着打开）

| 官方文件 | 抄什么 |
|----------|--------|
| `.../titlebar/media/titlebarpart.css` | 三栏、拖区、图标槽、line-height 22、失活透明度 |
| `.../titlebar/titlebarPart.ts` | 高度 30；左/中/右挂载顺序 |
| `.../titlebar/media/menubarControl.css` | 菜单 hover/focus |
| `.../base/browser/ui/menu/menubar.css` | 菜单钮 padding / 圆角 |
| `.../titlebar/menubar.contribution.ts` | 顶层菜单槽位与 `&&` 字母 |
| `.../platform/window/common/window.ts` | `DEFAULT_CUSTOM_TITLEBAR_HEIGHT = 35` 的注释（我们用无命令中心的 30） |

**不整文件移植**：`menubar.ts`（上千行 Monaco 菜单状态机）、命令中心、窗控、WCO、zoom counter。

落到我们：只改 `EditorHeader.tsx`、`EditorPresetMenu` 触发器、`EditorExportMenu` 触发器；可用一小份 `EditorTitlebar.module.css` 从上面 CSS **按条抄**。

中文「文件(F)」：官方英文源是 `&&File`，简中由 vscode-loc 另仓翻译。我们自己的 i18n 写成 `文件(F)` / `File(F)`，字母对 `F`/`E`，不另拉 vscode-loc。
