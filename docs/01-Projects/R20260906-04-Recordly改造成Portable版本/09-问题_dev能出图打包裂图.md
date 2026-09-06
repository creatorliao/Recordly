# 09 · 问题：pnpm dev 能出图，Portable 打包后背景网格裂图

> 2026-09-06：你补充「`pnpm dev` 能找到图片，打包后一直找不到」。  
> 这不是又一个新 UI bug，而是 **04 / 05 / 07 反复修却没钉死「开发态 ≠ 打包态」**。

## 1. 为什么记录了很多次还是裂

格子上的英文碎片（`Tab` / `Mid` / `iDa`）是壁纸专名被裁切的 `alt`，列表来自写死的 `BUILT_IN_WALLPAPERS`。  
**有名字 ≠ 磁盘列表成功，更 ≠ `<img>` 读到了文件。**

上一轮方案都默认：打包窗口也是 HTTP，只要 `getAssetPath` 返回 `/wallpapers/…`，就能像 Vite 一样出图。  
这条假设只对 **`pnpm dev`** 成立。

## 2. 两条完全不同的路

| | `pnpm dev` | Portable / 安装包 |
|--|------------|-------------------|
| 窗口 | Vite `http://localhost:<vite>` | 本机 `http://127.0.0.1:<随机端口>` 或回退 `file://` |
| `/wallpapers/foo.jpg` 从哪来 | Vite 把 `public/wallpapers` 挂到站点根 | builder **排除** `dist/wallpapers`，文件在 `resources/assets/wallpapers` |
| 不映射 extraResources 时 | 出图 | **404 裂图** |
| 缩略图 IPC 若失败 | 回退 `/wallpapers/…`，Vite 仍能救 | 回退同一条路径，**继续裂** |

所以：开发态看不出问题，打包后「总是找不到对应的图片」。

## 3. 上一轮为什么没真正执行出来

1. `getAssetPath` 对所有 HTTP 窗口都返回 `/wallpapers/…`，把 Vite 和打包 HTTP 当成同一条路。  
2. 网格在缩略图还没回来时，直接拿 `publicPath`（还是 `/wallpapers/…`）当 `img src`。  
3. 缩略图 IPC 返回 **Buffer**；打包窗 `contextBridge` 可能把 TypedArray 克隆丢空，渲染进程当成成功、缓存空 data URL，**再也回退不到 HTTP**。  
4. 文档写了「已落地」，但验收仍用开发态或仍依赖 `/wallpapers` img，Portable 真机继续裂。

## 4. 机器走查：上一轮修完仍会裂的口子

按打包窗真实执行，不只看网格 IPC：

1. **预览画布默认背景**仍 `getAssetPath` → `/wallpapers/tahoe-light.jpg` 当 CSS `url()`。没选壁纸时成片预览一样裂。  
2. **Video 页**格子 `previewUrl = publicPath`，仍是 `/wallpapers/wispysky.mp4`。  
3. **HTTP extraRoots 独占**：映射指到空目录就不再读 asar `dist/`，整段 404。  
4. **builder 排除 `dist/wallpapers`**：HTTP 没有第二份文件可回退。  
5. **`file://` 回退窗**若 `getAssetBasePath` 为空，仍会把 `/wallpapers` 当 src，Windows 上变成盘符根路径。  

这些和网格是同一类「开发态成立、打包态不成立」的洞，不补还会再裂。

## 5. 这次怎么修

- 主进程缩略图 / 整图都返回 **data URL 字符串**，不传 Buffer。  
- `/wallpapers/…`、`wallpapers/…`、打包 HTTP 绝对地址一律解析到 `getAssetRootPath()/wallpapers`。  
- **打包态网格 / 预览画布禁止** 把 `/wallpapers/…` 当 img/css src；失败留空，不裂图标。未打包仍走 Vite。  
- 视频壁纸打包态走磁盘路径 + 本机媒体服务。  
- HTTP extraRoots 文件不在则回退 asar `dist/wallpapers`；builder 不再排除这份副本。  
- `file://` 窗口一律当打包态。

## 6. 对工作流

只修背景预览出图。不改录→停→编→导。  
实施版本：`1.4.0-beta.5`。  
**怎么验：** 用 **`1.4.0-beta.5` 重新打的 Portable**（不要只跑 `pnpm dev`，也不要用 beta.4 旧 zip）进 Studio → 背景 → 图片，应出缩略图，不应 24 格裂图。
