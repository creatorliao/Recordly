# 13 · 需求与方案：从 VS Code 再抄五条（编辑器更专业）

> 对照仓：`D:\code\vscode` @ `3d7cfab`。只认源码，不另做目测验证。  
> **本条只改编辑器壳，不改录制 HUD。** 右键资源管理器是另一主题：[`R20260906-15`](../R20260906-15-Windows资源管理器右键用应用打开/00-README.md)。  
> 未听到「开始做」不改产品代码。

Recordly 现在：`EditorSidebar` 把场景/光标/摄像头/字幕/**设置/插件**排成一列图标砖（`h-9` + 27px 图标 + 右侧圆点）。设置和工具混在一起，不像专业 IDE。

下面五条都能从官方 CSS/DOM **按条抄**，能力用我们已有的，不抄终端/调试/命令面板。

---

## F1 · 活动栏：上头工具，左下角钉死齿轮

**需求**：左轨分成两段。上段是编辑工具；**最底下永远是齿轮**，只对应设置（外观/语言/启动/关窗等），不跟「场景/字幕」抢一排。

**VS Code 事实**

- 宽：`--activity-bar-width, 48px`（`activitybarpart.css`）
- 列：`.content { display:flex; flex-direction:column; justify-content:space-between; }`
- 上段 `.composite-bar { margin-bottom: auto; }` = Explorer/Search/…/Extensions
- 下段 `globalCompositeBar`（`activitybarPart.ts` `create()` 里先 composite、再 global）= 账号 + **Manage 齿轮**

**我们抄**

```tsx
{/* EditorSidebar 目标结构，数字抄官方 48 */}
<div className="flex h-full w-12 flex-col justify-between border-r">
  <div className="flex flex-col">{/* scene / cursor / webcam / captions / extensions */}</div>
  <button title={t("settings.sections.settings")} onClick={() => setActiveSection("settings")}>
    <Gear />
  </button>
</div>
```

官方选中指示是 **2px 色条**（`activityaction.css` `height: 2px` 在顶/底；侧栏常用左边条）。**去掉圆点列**（已有 D12）。

插件图标留在**上段**（VS Code 也把 Extensions 放上面，不放齿轮里）。

---

## F2 · 选中：左边 2px 条，不要蓝填充大方块

**需求**：当前工具用左边一条指示，图标保持 24、不填蓝、不发光点。

**抄** `activityaction.css` 的 `::before` 条（宽=轨宽、高 2px）。我们竖轨改成：

```css
.rail-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  width: 2px;
  height: 22px;
  background: currentColor;
}
```

---

## F3 · 顶栏右侧：切换主侧栏

**需求**：顶栏最右（导出左侧）一颗「侧栏开合」图标，对标你截的 VS Code 右侧那颗。点一下收起设置板，再点打开。活动栏本身可留着。

官方动作名：`workbench.action.toggleSidebarVisibility`（查看菜单）。我们只做按钮 + 本地 state，不抄命令元数据。

```tsx
<button
  type="button"
  title={t("editor.layout.toggleSideBar")}
  aria-pressed={sideBarVisible}
  onClick={() => setSideBarVisible((v) => !v)}
>
  {/* 抄 VS Code 的「方块+左边线」语义，可用现成图标 */}
</button>
```

落点：`EditorHeader` 右簇；`EditorShell` 控制 `SettingsPanel` 显隐。

---

## F4 · 底栏 22px 状态条

**需求**：编辑器最底一条矮状态栏，像专业软件，不抢预览。

**VS Code 事实**：`StatusbarPart.HEIGHT = 22`；`statusbarpart.css` `height: 22px; line-height: 22px`。

**我们只放已有信息**（不造问题面板）：

| 左 | 右 |
|----|----|
| 未保存 · 课名 | 当前时间 / 总时长 · 导出预设名 |

```tsx
<footer className="flex h-[22px] shrink-0 items-center justify-between border-t px-2 text-[12px]">
  <span>{hasUnsavedChanges ? t("editor.unsaved") : t("editor.saved")}</span>
  <span className="font-mono">{current} / {duration}</span>
</footer>
```

高度写死 **22**，不要改成 28「好看一点」。

---

## F5 · 文件菜单「最近打开」

**需求**：`文件(F)` 里有「最近打开」，列出最近项目，点开即进（培训师连着改几节课）。

官方：`MenubarFileMenu` + `OpenRecentAction`（`windowActions.ts`）。我们**不抄**它的远程/工作区逻辑，只复用已有 `ProjectBrowserDialog` 那 24 条数据。

```tsx
<DropdownMenuSub>
  <DropdownMenuSubTrigger>{t("editor.project.openRecent")}</DropdownMenuSubTrigger>
  <DropdownMenuSubContent>
    {recentProjects.slice(0, 10).map((p) => (
      <DropdownMenuItem key={p.path} onSelect={() => openProject(p.path)}>
        {p.name}
      </DropdownMenuItem>
    ))}
  </DropdownMenuSubContent>
</DropdownMenuSub>
```

10 条上限对齐 VS Code `MAX_MENU_RECENT_ENTRIES = 10`（`menubarControl.ts`）。

---

## 不做（避免过度设计）

命令面板、终端、账号头像、把菜单塞进活动栏、Win11 Explorer Command DLL（见 R15）、问题/输出面板。

---

## 排进本夹队列

| ID | 并入 | WP 意向 |
|----|------|---------|
| F1 F2 | 加强 V2b（左轨），仍与 V2a 分 PR | `feat/R14-wp-d1b-sidebar-density` 扩范围 |
| F3 F5 | 并入 V2a（顶栏菜单条） | `feat/R14-wp-d1a-editor-menubar` |
| F4 | P04 新 WP D1c | `feat/R14-wp-d1c-statusbar` |

代决：D18 齿轮钉底；D19 选中 2px 条；D20 顶栏可关侧栏；D21 状态栏高 22；D22 最近 10 条。
