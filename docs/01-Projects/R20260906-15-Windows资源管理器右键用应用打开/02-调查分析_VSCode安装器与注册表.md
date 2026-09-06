# 02 · 调查：VS Code 怎么做，和我们差在哪

钉死：`D:\code\vscode` @ `3d7cfab`。主文件 `build/win32/code.iss`。

---

## 1. VS Code 给用户看的是**一个动词**

安装向导「附加任务」（官方 **默认不勾**）：

```iss
Name: "addcontextmenufiles"; Description: "{cm:AddContextMenuFiles,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "addcontextmenufolders"; Description: "{cm:AddContextMenuFolders,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
```

英文资源：`Add "Open with %1" action to Windows Explorer file/directory context menu`。

经典菜单（Win10；Win11「显示更多选项」）`code.iss` 约 1275–1287 行，`{#RegValueName}` 一般是 `VSCode`：

| 键 | 命令 | 何时写 |
|----|------|--------|
| `Software\Classes\*\shell\{Name}` | `"{exe}" "%1"` | 任务 `addcontextmenufiles` 且不是 Win11 新菜单 |
| `Software\Classes\directory\shell\{Name}` | `"{exe}" "%V"` | 文件夹 |
| `Software\Classes\directory\background\shell\{Name}` | `"{exe}" "%V"` | 文件夹空白处 |
| `Software\Classes\Drive\shell\{Name}` | `"{exe}" "%V"` | 盘符 |

公共值：默认名 `Open with {App}`（中文 `OpenWithCodeContextMenu`）；`Icon` = exe；`Flags: uninsdeletekey`。

`%1` = 文件路径；`%V` = 文件夹/盘符/空白处当前目录。

**没有**第二条「Open in new window」写进资源管理器。新窗口是应用内 / CLI（`--new-window`），不是资源管理器第二项。

应用内：**没有**「加入 / 移除资源管理器右键」设置。装的时候没勾，以后只能重装或手改注册表。

另有文件关联：`Software\Classes\{Name}.md\shell\open\command`。那是双击打开，不是右键「用 Code 打开」。两套可并存。

---

## 2. Win11 第一层菜单（不抄进第一期）

同文件写 `Software\Classes\{#RegValueName}ContextMenu` 的 Title，真正画在 Win11 精简菜单上的是 **Explorer Command DLL**（`code_explorer_command_x64.dll`），从 `microsoft/vscode-explorer-command` 拉制品。COM `IExplorerCommand`，不是几行注册表。

第一期：**不搬 DLL**。Win11 用户走「显示更多选项」里的经典项。

---

## 3. 应用怎么接到路径

安装只负责注册 `exe + 路径`。进程内必须：

1. 读 `process.argv`（Electron 跳过 `--` 与 electron 自身参数）  
2. 单实例：`second-instance` 把新 argv 交给已开窗口  
3. 按扩展名分流

VS Code 主进程有完整 CLI。Electron 用 `app.requestSingleInstanceLock()` + `second-instance` 即可。

Recordly 现状：`electron/main.ts` 有 `second-instance` 但**没有**按路径打开项目，也**没有** `--record` / `--hud`；`electron-builder.json5` 的 `nsis` 只有快捷方式，**没有** `include` 自定义脚本。

---

## 4. 和 Portable 的关系

Inno/NSIS 写的是安装目录 `{app}`。Portable 换盘后路径失效。

| 分发 | 做法 |
|------|------|
| NSIS/Inno | 可预勾「设置里的开关」；真正写键以**当前用户设置 + 当前 exe** 为准 |
| Portable | 设置打开时写 **HKCU**，`command` 指向 `process.execPath`；关掉删键 |

不要对 Portable 写 HKLM。

---

## 5. 为什么不能只抄 VS Code 这一条

| | VS Code | Recordly（本夹要做的） |
|--|---------|------------------------|
| 产品形态 | 一间房：编辑器打开路径 | **两间房** + 金路径第一步是**录** |
| 右键动词 | 只有「用 Code 打开」 | 开录 / 开工具栏 / 打开项目或文件 |
| 开关 | 安装向导，默认不勾 | **设置里开关**；打开后菜单出现 |
| 路径含义 | 路径 = 要编辑的工作区 | 路径 = 项目/课目录/视频；**采集源仍是上次源** |

对照习惯：多动词用 **级联子菜单**（7-Zip、WinRAR），不要在资源管理器根上平铺五条。VS Code 平铺一条是因为它只有一个动词。

Notepad++ / 7-Zip 的「在设置里加入资源管理器」比 VS Code 安装器更符合本会话口述。
