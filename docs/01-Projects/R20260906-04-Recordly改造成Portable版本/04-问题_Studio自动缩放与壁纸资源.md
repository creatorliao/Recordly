# 04 · 问题记录：Studio 自动缩放 + 壁纸资源

> 2026-09-06 真机：portable（及此前打出来的安装包）进 Studio 后异常。  
> 你后来说清楚：录完进 Studio，**拖放操作没有自动加到时间轴**；以前的版本有。

---

## 问题 1 · 壁纸缩略图全是裂图

**现象：** 场景「图片」网格约 24 个槽全是裂图。界面文字/滑条正常。  
**范围：** 你观察到打包产物都会这样，不单 portable。

**原因（源码）：**

- 壁纸实体在 `extraResources` → `resources/assets/wallpapers`（本仓 portable 目录里**文件是在的**）。
- 界面列表来自写死的 `BUILT_IN_WALLPAPERS`，缩略图走 `getAssetPath` → 失败则退回 `/wallpapers/xxx.jpg`。
- 打包窗口用本机 HTTP 读 `app.asar` 里的 `dist/`，而 builder **故意排除了 `dist/wallpapers`**。HTTP 去拉 `/wallpapers/…` 就是 404。

**已落地（2026-09-06）：**

1. 打包 HTTP：`electron/rendererServer.ts` 把 `/wallpapers` 映射到 `getAssetRootPath()/wallpapers`（`extraResources`），不再去 asar 的 `dist/`。  
2. `getAssetRootPath()` 增加 portable / 异常布局候选路径。  
3. `SettingsPanel` 缩略图失败时仍走 `getAssetPath`，不用裸 `/wallpapers/` 当 img src。  
4. `assetPath.toLocalFilePath` 用 `URL` 解析 `file://`，避免 Windows 盘符路径解析错。

**你怎么验：** 再打 `build:win` / `build:win:portable` → 进 Studio 场景「图片」，缩略图应能出图，不应整页裂图。

---

## 问题 2 · 拖放不自动进时间轴（本次对准的根因）

**现象：** 录制时有鼠标拖放；停录进 Studio，时间轴**没有**自动出现缩放块。以前有。

**链路：**

```
录制中采集光标 → *.cursor.json
    → 进 Studio 自动 suggest
    → buildInteractionZoomSuggestions
    → 时间轴 zoom 块
```

**根因有三层，叠在一起：**

| 层 | 事实 |
|----|------|
| 采集 | Windows `cursor-monitor.exe` **只输出 `STATE:`（箭头/手型）**，**不输出按下/抬起**。点击/拖放完全指望 `uiohook-napi`。打包后 uiohook 原生模块经常加载失败 → 遥测里只剩定时 `move`。 |
| 算法 | `buildInteractionZoomSuggestions` **只认 explicit click**，并写明忽略停留启发式。没有 click → `no-interactions` → **一块都不加**。 |
| 展示 | 即便有 click，拖放的 `mouseup` **不延长**缩放区间，块只在按下附近 ±500ms。长拖在时间轴上几乎看不见，像「没加上」。 |

这就是「以前 dev / 旧算法有，现在打出来的包没有」：开发态 uiohook 能用；打包后常只剩 move；新算法还不认 move。

**已落地（2026-09-06）：**

1. `zoomSuggestionUtils`：拖放把区间拉到 `mouseup`；没有 click 时退回停留启发式（单测 16 过）。  
2. `cursor-monitor` C++：`WH_MOUSE_LL` 输出 `INTERACTION:mousedown/mouseup`。  
3. 启动 helper 时 `cwd` = exe 目录。  
4. **CMake 本机自动配上**：`scripts/ensure-windows-cmake.mjs`（PATH / 常见路径 / winget `Kitware.CMake` / 官方 zip）。本次已用 winget 装到 `C:\Program Files\CMake\bin\cmake.exe`。  
5. VS 安装器未登记实例时，构建脚本改走 `vcvars64.bat + NMake`。MSVC 加 `/utf-8`，避免中文注释把编译打崩。  
6. **已强制重编**并写入 `electron/native/bin/win32-x64/cursor-monitor.exe`，`helpers-manifest.json` 的 `cursor-monitor` 指纹已更新（`updatedAt` 2026-09-06T07:40:45Z）。

**你怎么验：** 再打一份 Windows 包（`npm run build:cursor-monitor` 已跑通）→ 录一段：单击、拖一条滑块/选中文字 → 进 Studio，时间轴应出现盖住拖动时段的缩放块。
