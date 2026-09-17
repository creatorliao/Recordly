# 转写模型从哪来 · 调查报告

> **一句话**：Recordly 的自动字幕模型不是自己训练的，也不是从官方服务器发的——它是**运行时从 Hugging Face 上一个叫 `ggerganov/whisper.cpp` 的公开仓库里现下**的 OpenAI Whisper `small` 模型（ggml 量化格式），465 MiB，无需注册、无需付费；那个网站是全球最大的开源模型托管站，上面还有**一批比现在这个模型更适合中文录屏转写的东西**值得拿。

| 项 | 值 |
|----|-----|
| 调查主题 | Recordly 语音转写（自动字幕）模型的来源、托管网站性质、可替代/可增补资源 |
| 调查日期 | 2026-09-17 |
| 被查仓库 | `D:\code\Recordly`（当前分支 `main`，HEAD `68bca43f`，v1.4.0-beta.1） |
| 调查人 | 智能体（金线调查研究法：假设 → 取证 → 事实表 → 标-本-药） |
| 关联既有文档 | `origin/dev-creator:docs/01-Projects/R20260906-08-Recordly字幕与Whisper运行时打包/`（同一主题的前一轮调查，结论已交叉引用） |

---

## 0. 三句话结论（标-本-药）

**标（症状）**：自动字幕要 465 MiB 的模型，界面只有一个「下载模型」按钮；国内实测超时失败；模型是 `whisper-small`（244M 参数），中文识别质量与断句只能算中等；引擎和模型被拆成两件事，用户看不懂。

**本（根因）**：
1. 模型来自 `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`——**Hugging Face 的公开直链、无鉴权、无校验、30 秒超时、无断点续传**（`electron/ipc/captions/whisper.ts` + `electron/ipc/constants.ts`）。
2. 用的档位是 `small`。同一个仓库里就有 **`large-v3-turbo-q5_0.bin`（574 MB，只比现在大 18%）**，参数量 244M → 809M，同样是官方仓库 + MIT 许可 + 原生兼容。
3. whisper.cpp v1.8.4 早已支持 VAD（`--vad` + `-vm`），但项目**没有使用**，反而把 `whisper-vad-speech-segments` 排除出安装包；同时 v1.9.x 新增/修复了多项与本项目直接相关的项（Parakeet 支持、**CJK 的 `voice_length()` UTF-8 修复**、VAD 开启时的时间戳映射）。

**药（具体动作，三条）**：
1. **把 `ggml-large-v3-turbo-q5_0.bin`（574,041,195 B，sha256 `3942217…`）作为「更准」档内置或可选**——改一处常量即可，格式原生兼容，收益是中文识别档位从 244M 跳到 809M，代价是包体 +87 MiB。
2. **把下载域名做成可配置（或加镜像回退）**——当前写死 `huggingface.co`，无代理、无镜像、30 s 超时；`hf-mirror.com` 同路径实测返回 200 且字节数完全一致（487,601,967），但它是**第三方公益镜像**，要做成"可切换"而不是"默认替换"。
3. **给 `whisper-cli` 加上 `--vad -vm <silero-v6.2.0>`**，并把 VAD 模型（**885,098 B**，来自另一个仓库 `ggml-org/whisper-vad`）纳入随包资源——这是**用 0.84 MiB 换"长录屏少幻觉、按真实停顿断句"**，性价比最高的一项。

---

## 1. 调查设定

### 1.1 假设（先立假设，否则就是堆资料）

| # | 假设 | 结论 |
|---|------|------|
| H1 | 模型不是项目自带，是运行时下载的 | ✅ 成立（main 分支） |
| H2 | 下载源是第三方模型托管站，不是 OpenAI 或应用自己的服务器 | ✅ 成立（Hugging Face） |
| H3 | 该站上还有比 `small` 更值得用的同类模型 | ✅ 成立，且同仓库内就有 |
| H4 | 换模型是"改常量级"的改动 | ✅ 成立（模型选择器已支持任意 `.bin`） |
| H5 | 反例：这件事是不是"没必要再做调查" | ⚠️ 部分成立——`dev-creator` 分支上已有一轮同类调查并已实施"模型入包"；本报告的增量在**外部世界的新事实**（站点产权变动、引擎版本断供、VAD/中文新选项） |

### 1.2 证据等级（全文沿用）

| 标记 | 含义 |
|------|------|
| 【实测·本机】 | 我在本机跑命令得到的输出 |
| 【实测·抓取】 | 我直接请求 HTTP / API 得到的响应 |
| 【代码】 | 仓库源码逐行可查（附文件与行号） |
| 【转引】 | 委派调研返回并附 URL，我未独立复跑 |
| 【新闻】 | 媒体报道，未能读到正文原文 |

### 1.3 不在本次范围

- 不做中文 ASR 的横向跑分实测（需要统一测试集与算力，本次只核格式、许可、体积、来源）。
- 不评估把模型换成云端 ASR 的方案（`dev-creator` 已明确"不再做：改云端 ASR"）。
- 不改代码，只出调查结论。

---

## 2. 事实表（福尔摩斯六问）

| # | 问 | 事实 | 来源 | 可信度 |
|---|----|------|------|--------|
| F1 | **Who** 谁提供模型 | Hugging Face 账号 `ggerganov`（whisper.cpp 作者 Georgi Gerganov；GitHub 组织现名 `ggml-org`） | 【实测·抓取】`GET https://huggingface.co/api/models/ggerganov/whisper.cpp` → `author=ggerganov` | 高 |
| F2 | **Who** 谁提供权重 | OpenAI Whisper `small`（多语版），由 whisper.cpp 项目转成 ggml 格式 | 【实测·抓取】仓库 model card 原文："OpenAI's Whisper models converted to ggml format" | 高 |
| F3 | **What** 具体文件 | `ggml-small.bin`，**487,601,967 字节（465.0 MiB）**，sha256 `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` | 【实测·抓取】`HEAD` 的 Content-Length + HF tree API 的 `lfs.oid` | 高 |
| F4 | **Where** 从哪下 | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin` | 【代码】`electron/ipc/constants.ts:19-20` | 高 |
| F5 | **Where** 落到哪 | `%APPDATA%\Recordly\whisper\ggml-small.bin`（dev 态是 `Recordly-dev`） | 【代码】`constants.ts:21-22`、`electron/appPaths.ts:4-8` | 高 |
| F6 | **When** 什么时候下 | 用户在字幕面板点「Download Model」时 | 【代码】`SettingsPanel.tsx:2356-2362` → preload `downloadWhisperSmallModel` | 高 |
| F7 | **How** 怎么下 | Node `https.get` + 手动跟最多 5 次重定向 + 写临时文件 `.download` 再 rename；**超时 30 s、无断点续传、无校验、无代理** | 【代码】`whisper.ts:41-151` | 高 |
| F8 | **How** 引擎从哪来 | 另一条线：`whisper.cpp` **v1.8.4** 的 Windows 预编译 zip（4,078,768 B），构建期下载、带 SHA-256 校验，落到 `electron/native/bin/win32-x64/` | 【代码】`scripts/build-whisper-runtime.mjs:14,19-20,254-298`；【实测·本机】sha256 与仓库内固定值**完全一致** | 高 |
| F9 | **Why** 为什么是这个档 | 无任何注释说明选型理由；`small` 是"体积/速度/质量"的常见折中默认值 | 【代码】`constants.ts` 无注释 | 中（推断） |
| F10 | 该站什么性质 | Hugging Face，全球最大开源 AI 模型/数据集托管与协作平台 | 【实测·抓取】站点标题 "Hugging Face – The AI community building the future."；【转引】官方定价与文档页 | 高 |
| F11 | 下载要不要钱/账号 | **不要**。无 token 匿名 `HEAD` 返回 200；公开仓库 `gated=false` | 【实测·抓取】无鉴权 HTTP 200，且响应被 302 到 `us.aws.cdn.hf.co` 的签名 URL（`user_id=public`） | 高 |
| F12 | 许可 | 仓库 `license = mit` | 【实测·抓取】HF API `cardData.license = mit`；model card front-matter `license: mit` | 高 |
| F13 | 国内能不能直连 | **本机实测能**（但本机出口不在中国大陆，不构成国内证据）；阿里云官方文档承认"可能因网络跨域无法访问" | 【实测·本机】HTTP 200；【转引】阿里云 PAI 文档 | 中 |
| F14 | 镜像 | `hf-mirror.com` 同路径返回 200 且 `Content-Length` 完全一致；自述为**公益项目**、**不是官方镜像**、**不支持登录** | 【实测·抓取】HEAD 487,601,967 B；首页 meta description 原文 | 高 |
| F15 | 站点产权 | 多家媒体报道 NVIDIA 以约 **129 亿美元**收购 Hugging Face（2026-09-03 前后）；**交割状态未核实** | 【新闻】NYT / CNN / RTHK / Anadolu / 36Kr / Yahoo Finance 标题一致；正文未能抓取 | 中 |
| F16 | 同仓库其它模型 | 47 个文件中 33 个 `ggml-*.bin` + 8 个 Core ML 编码器 zip；含 `large-v3-turbo` / 各档量化 | 【实测·抓取】HF tree API 全量清单 | 高 |
| F17 | VAD 模型在哪 | **不在**这个仓库；在 `ggml-org/whisper-vad`，`ggml-silero-v6.2.0.bin` = 885,098 B，MIT | 【实测·抓取】HF API + tree | 高 |
| F18 | 项目用没用 VAD | **没用**。传给 whisper-cli 的参数只有 `-m -f -osrt -of -l -np -ojf` | 【代码】`electron/ipc/captions/generate.ts:248-259` | 高 |
| F19 | 打包排除了什么 | 排除了 `whisper-bench / quantize / server / vad-speech-segments` | 【代码】`electron-builder.json5:25-28` | 高 |
| F20 | 引擎版本现状 | 项目钉 v1.8.4；上游最新 v1.9.4（2026-09-11）；但 **v1.9.3 / v1.9.4 的 release 没有任何附件**，v1.9.4 的 `whisper-bin-x64.zip` 实测 404 | 【实测·抓取】GitHub Releases API + 直连 HEAD 404 | 高 |

---

## 3. 关键认知：引擎 ≠ 模型

这是整件事最容易混的一层。`dev-creator` 的既有调查已经用一个比方说清了，我沿用并补上实测数字：

> **zip = 发动机；`.tmp` = 车间零件箱；模型 `.bin` = 油和地图。**

| | 引擎（Runtime） | 模型（Weights） |
|---|---|---|
| 是什么 | `whisper-cli.exe` + `whisper.dll` + `ggml*.dll` | `ggml-small.bin` |
| 谁提供 | `ggml-org/whisper.cpp` 的 **GitHub Release** | `ggerganov/whisper.cpp` 的 **Hugging Face** |
| 什么时候拿 | **构建期**（`npm run build:whisper-runtime`） | **运行期**（用户点按钮） |
| 多大 | 4,078,768 B（zip）/ 解压后约 6 MB | 487,601,967 B |
| 完整性校验 | ✅ 有（脚本里固定 sha256，我实测一致） | ❌ **没有** |
| 失败后果 | 打包机缺 CMake 时报错（可 `WHISPER_RUNTIME_ALLOW_MISSING=1` 跳过） | 用户看到"下载了一下又失败" |
| 本机现状 | Windows 侧**尚未生成**（`electron/native/bin/win32-x64/` 只有 4 个采集类 exe，无 whisper-cli.exe）；目录被 `.gitignore` 排除 | **未下载**（`%APPDATA%\Recordly-dev\` 下无 `whisper\` 目录） |

> 【实测·本机】`electron/native/bin/darwin-arm64/` 里倒是有完整的 `whisper-cli`（3,116,664 B）等 6 个二进制——但那是 macOS 侧的本地产物，Windows 侧需要跑一次构建脚本才有。

---

## 4. 问题一：模型从哪来、是怎么来的

### 4.1 一句话答案

> **从 Hugging Face 上 `ggerganov/whisper.cpp` 仓库的 `main` 分支公开直链现下的**，文件是 OpenAI Whisper `small` 多语言模型的 ggml 转换版，465 MiB。

### 4.2 代码级证据链（四处，缺一不可）

```text
① electron/ipc/constants.ts:19-22
   WHISPER_MODEL_DOWNLOAD_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
   WHISPER_MODEL_DIR          = path.join(USER_DATA_PATH, "whisper")
   WHISPER_SMALL_MODEL_PATH   = path.join(WHISPER_MODEL_DIR, "ggml-small.bin")

② electron/ipc/captions/whisper.ts:113-151  downloadWhisperSmallModel()
   mkdir → 删旧 .download → downloadFileWithProgress(url, tmp) → rename(tmp → 正式路径)
   失败则删 tmp 并把 status 置为 "error"

③ electron/ipc/captions/whisper.ts:41-111  downloadFileWithProgress()
   https.get(currentUrl, { timeout: 30_000 })
   3xx 且有 location → 跟最多 5 跳
   2xx → 按 content-length 报进度，pipe 到写流

④ src/components/video-editor/SettingsPanel.tsx:2335-2363
   三个互斥分支：downloading（禁用+百分比）/ 已有模型（显示「删除模型」）/ 无模型（蓝色「下载模型」）
```

### 4.3 实测证据（我亲自跑的）

| 检查项 | 结果 |
|--------|------|
| `HEAD` 模型直链 | **200**，`Content-Length: 487601967`，`Content-Type: application/octet-stream` |
| 重定向链路 | **302 → `https://us.aws.cdn.hf.co/xet-bridge-us/...`**，签名 URL 内含 `user_id=public`，带 `Expires` 与 `Signature` —— 说明**匿名可下**，且现在走的是 HF 的 Xet 存储/CDN |
| 字节数是否与仓库记录一致 | ✅ HF tree API `lfs.size = 487601967`，与 Content-Length 一致 |
| sha256 | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |
| **对 sha256 做了一次反证** | 我另下 `ggml-tiny.bin`（77,691,713 B）实算 sha256 = `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`，**与 HF tree API 的 `lfs.oid` 完全一致**；而仓库 model card 表格里写的 tiny sha 是 `bd577a11…`，**对不上** |
| 结论 | **要校验就用 HF tree API 的 `lfs.oid`；model card 表格里的 SHA 列已过期，别照抄** |
| 引擎 zip 校验 | 实测下载 `whisper-bin-x64.zip` = 4,078,768 B，sha256 = `74f973345cb52ef5ba3ec9e7e7af8e48cc8c71722d1528603b80588a11f82e3e`，与 `build-whisper-runtime.mjs:20` 里钉的值**完全一致** |
| 本机是否已有模型 | ❌ 没有。`%APPDATA%\Recordly` 不存在；`%APPDATA%\Recordly-dev` 存在但无 `whisper\` 子目录 |

### 4.4 用户实际看到的链路（8 步）

```text
1  打开编辑器 → 右侧「字幕」面板
2  面板里没有模型 → 蓝按钮「下载模型」（中文 UI；zh-CN/settings.json:177）
3  点击 → preload: downloadWhisperSmallModel() → ipc "download-whisper-small-model"
4  主进程 mkdir %APPDATA%\Recordly\whisper
5  https.get 打 huggingface.co（30 s 超时，最多 5 跳 302）
6  数据流落到 ggml-small.bin.download，同时推 "whisper-small-model-download-progress" 给界面画进度条
7  完成后 rename 成 ggml-small.bin，status="downloaded"
8  「生成字幕」按钮从灰变亮（disabled 条件是 !whisperModelPath）
```

### 4.5 版本沿革（git 留痕，回答"是怎么来的"）

| 日期 | commit | 作者 | 说明 |
|------|--------|------|------|
| 2026-03-22 | `0d9a1d19` | webadderall（上游） | `feat: add backend Whisper and native audio support` —— **首次引入** whisper.cpp 后端与模型下载 |
| 2026-03-27 | `7d7b61b7` | Mahdy Arief | `feat: add blur annotation and Whisper model selection for autocaption` —— 加了「手动选模型」入口 |
| 2026-03-28 | `719fa78e` | — | `Revert "feat: Advanced Video Editor ... AI Auto-Captions"`（部分回退） |
| 2026-04-17 | `099ce2bb` | webadderall | `refactor: split handlers.ts into focused sub-modules` —— 拆出 `electron/ipc/captions/whisper.ts` |
| 2026-09-06 | `5fcf6277` | liaohai1（本方） | `fix(windows): 打包壁纸与 Whisper 入包…` —— **在 `dev-creator` 分支**上做了"模型随包 + 界面去掉下载/选择"，本次调查的 `main` 分支**不含**这些改动 |

> ⚠️ **重要边界**：本报告描述的代码行为基于**当前 checkout 的 `main`**（仍有下载按钮、无捆绑模型探测）。您自己那套"模型入包、界面不逼下载"的改造在 `origin/dev-creator` 上，两者不要混着引用。

### 4.6 这条下载路径的五个实测缺陷

| # | 缺陷 | 证据 | 后果 |
|---|------|------|------|
| D1 | **30 秒硬超时** | `whisper.ts:48` `{ timeout: 30_000 }` | 465 MiB / 30 s ≈ 需稳定 **130 Mbps**；国内基本不可能，必然 `req.destroy` + 删临时文件 |
| D2 | **无断点续传** | `whisper.ts:126` 先 `fs.rm(tempPath)` | 断一次从 0 开始，100 MB 白下 |
| D3 | **无完整性校验** | 全文件无 hash 比较 | 下载被截断/被中间设备篡改都不会发现，直到 whisper 报 "bad model" |
| D4 | **域名写死、无镜像、无代理** | 常量硬编码；用裸 `https` 不走 Electron `session` 代理 | 公司网/无代理环境必失败；也无从切换到 `hf-mirror.com` |
| D5 | 引用可变分支 `main` | URL 用 `resolve/main/`，非 commit/tag 钉死 | 上游换文件你无感，且**与 D3 叠加**成为供应链风险 |

> 交叉印证：`dev-creator:docs/01-Projects/R20260906-08/03-调查分析_运行时缓存与模型下载.md` 独立得出同一组结论（"466 MB 要在 30 秒内拉完，国内几乎不可能"、"无镜像、无断点续传"、"无代理"），并记录了走本机代理约 2 分钟下完的实测。**两条独立来源一致 → 该结论可信度高。**

---

## 5. 问题二：那个网站是什么

### 5.1 一句话

> **Hugging Face（huggingface.co）**——全球最大的开源 AI 模型 / 数据集 / 在线应用托管与协作平台，被业内称为"AI 界的 GitHub"。我们要的那个 `.bin` 就躺在它上面一个公开仓库里。

【实测·抓取】站点标题：`Hugging Face – The AI community building the future.`

### 5.2 主营（它到底提供什么）

| 板块 | 是什么 | 与我们的关系 |
|------|--------|--------------|
| **Models** | 模型仓库托管 + 版本管理 + 模型卡 | ✅ **我们用到的就是这块** |
| **Datasets** | 数据集托管 | 无关 |
| **Spaces** | 在线 demo 应用（Gradio/Streamlit/Docker/静态页），含 ZeroGPU | 可用来在线试模型再决定下不下 |
| **Inference Providers** | 聚合多家推理供应商的统一 API | 替代方案（见 6.6），但免费额度极小 |
| **Inference Endpoints** | 专用推理部署 | 收费，与我们无关 |
| **Storage Buckets / Jobs / Enterprise** | 对象存储 / 批处理任务 / 企业方案 | 无关 |

【转引】来源：`https://huggingface.co/pricing`、`https://huggingface.co/docs/inference-providers/index`

### 5.3 账号与成本（用户最关心的三问）

| 问 | 答 | 证据 |
|----|----|------|
| 个人账号免费吗？ | **免费**。收费项只有 PRO（$9/月）、Team（$20/用户/月）、Enterprise | 【转引】定价页 |
| 下模型要钱吗？ | **不要钱** | 【实测·抓取】匿名 HTTP 200 |
| 要注册 / 要 Token 吗？ | **公开仓库不需要**。只有 **gated（门控）** 仓库才要登录 + 同意条件 + 提供邮箱 | 【实测·抓取】`ggerganov/whisper.cpp` 的 `gated=false`；反例：`pyannote/segmentation-3.0` 匿名 `HEAD` → **401**【转引】HF《Gated models》文档 |

> **对我们的直接意义**：`ggml-small.bin` 属于"完全公开、匿名可下、MIT 许可"那一类，所以应用内置自动下载在**合规上没有门槛**。这一点很重要——它意味着**问题不在许可，只在网络与实现**。

### 5.4 我们这次用到的是它哪一块能力

只用了最简单的一层：**公开仓库的 `resolve` 直链**。

```text
https://huggingface.co/<作者>/<仓库>/resolve/<分支或commit>/<文件名>
                    └ ggerganov  └ whisper.cpp            └ main  └ ggml-small.bin
```

它背后其实是 **302 重定向到 CDN**（实测落到 `us.aws.cdn.hf.co` 的 Xet 桥接，签名 URL + `Expires`）。所以：
- 我们其实**没有用**它的账号、API、SDK、鉴权、CLI —— 就是一个能匿名 GET 的静态文件 URL；
- 这也解释了为什么"换镜像"很容易：把域名前缀换掉就行。

### 5.5 国内访问现状（**谨慎结论**）

必须把两件事分开，否则容易得出错的结论：

**（a）本机实测：能直连。** 我在本机（出口**不在**中国大陆）对 `huggingface.co` 的模型直链、仓库页、API 全部返回 200。**这不构成"中国大陆能访问"的证据。**

**（b）中国大陆的实际情况**：可核实的是**问题被官方文档承认过**。

- 【转引】阿里云 PAI 文档《跨域拉取海外模型或容器镜像》原文："在中国内地地域……拉取海外模型（**如 huggingface.co**）时，**可能因网络跨域无法访问**"，并列出"**使用国内镜像站**｜下载 HuggingFace 上的热门模型和数据集｜**免费**"作为替代方案。来源：`https://www.alibabacloud.com/help/zh/pai/cross-domain-pull-overseas-model-or-container-image-in-dsw`
- 您自己那一轮调查（`R20260906-08/03`）也记录了国内失败的具体表现与"走本机 `127.0.0.1:1087` 代理约 2 分钟下完"的实测。

**（c）镜像的性质（实测）**：`hf-mirror.com`

| 检查 | 结果 |
|------|------|
| 同路径文件 | **200**，`Content-Length: 487601967` —— **与官方完全一致** |
| 首页 meta 自述 | "加速访问 Hugging Face 的门户。作为一个**公益项目**，我们致力于提供稳定、快速的**镜像服务**，帮助国内用户无障碍访问 Hugging Face 的资源。" |
| 是否官方 | **不是**。官方只提供 `HF_ENDPOINT` 环境变量机制让客户端指向任意镜像，**没有官方运营的中国镜像域名** |
| 是否支持登录 | 首页明确"**本站不支持登录**"；门控模型要先去官网拿 Token |

> **结论**：`hf-mirror.com` 是**第三方社区公益镜像**，字节一致、可用，但**无 SLA、无主体公示、不支持登录**。把它做成"用户可切换的备选通道"是合理的；把它做成默认且唯一通道，等于把 465 MiB 的供应链押在一个公益站上。

### 5.6 许可：能不能随包、能不能商用

| 层 | 许可 | 结论 |
|----|------|------|
| `whisper.cpp` 代码 / 引擎 | **MIT** | 【实测·抓取】GitHub API `license.spdx_id = MIT`；HF 仓库 `license = mit` |
| ggml 权重（本仓库） | **MIT**（仓库 card 声明） | 可随包、可商用，保留署名即可 |
| 上游 OpenAI Whisper | GitHub `openai/whisper` 的 LICENSE = **MIT** | 【实测·抓取】GitHub API |
| ⚠️ 一个不一致点 | HF 上 `openai/whisper-large-v3` / `small` / `tiny` 的 card 写 **apache-2.0**，只有 `whisper-large-v3-turbo` 写 **mit** | 【转引】逐仓 API 查询。**同一家模型在不同托管处的许可声明不统一** |
| 要记住的规矩 | HF 的 `license` 字段是**仓库作者自报的元数据**，不是平台审核结论 | 【转引】HF《Licenses》文档："Remember to seek out and respect a project's license" |

**对本项目的判断**：`ggml-small.bin` / `ggml-large-v3-turbo*.bin` 这类来自 `ggerganov/whisper.cpp` 的文件，仓库声明 MIT，**随包分发与商用没有许可障碍**；但项目目前**没有在 `LICENSE.md`、README 或应用内声明任何 whisper.cpp / Whisper 的第三方归属**（我 grep 过 `*.md` / `*.json5` / `LICENSE.md`，只有一处复盘文档提到 whisper.cpp，没有 NOTICE）。这在 MIT 下是**应当补的一项**。

### 5.7 新情况：站点产权正在变动（2026-09）

| 项 | 内容 | 状态 |
|----|------|------|
| 事件 | 多家媒体报道 **NVIDIA 以约 129 亿美元收购 Hugging Face**，时间点在 2026-09-03 前后 | 【新闻】NYT、CNN Business、RTHK、Anadolu、36Kr（英文版）、Yahoo Finance、Business Insider ES 等标题一致 |
| 金额 | $12.9B ~ $12.93B（约 129 亿美元） | 多源一致 |
| 交割状态 | **未核实**。有标题称 "Becomes Definitive" / "Nears Finalization"，也有维基百科 infobox 写作 `parent = Nvidia (100%)` | ⚠️ **未能读到权威原文正文**，各源页面对我的抓取通道返回空正文 |
| 对我们的含义 | ① 短期**不影响**已下载的 MIT 模型与静态直链；② 中期要留意**平台政策、定价、下载限速、区域可用性**可能变化；③ 任何"把命脉压在单一模型托管站"的设计都多了一条外部风险 | 判断，非事实 |

---

## 6. 问题三：在上面还能找到什么值得拥有的

### 6.1 先看"同一个仓库里本来就有"的（HF tree API 全量实测）

仓库元数据：`license = mit`｜`pipeline_tag = automatic-speech-recognition`｜**47 个文件**｜likes **1593**｜createdAt 2023-03-22｜lastModified **2024-10-29**（**已近两年未更新**）｜占用 **30.97 GiB**｜`trackDownloads: false`（**下载量未统计，API 返回 0 不代表没人下**）｜另挂 74 个 Spaces（如 `radames/whisper.cpp-wasm` 可在浏览器内跑）。

| 文件 | 对应型号 | 精确字节 | MiB | 用途判断 |
|------|----------|----------|-----|----------|
| `ggml-tiny.bin` | tiny 多语 | 77,691,713 | 74.1 | 只适合验证链路 |
| `ggml-base.bin` | base 多语 | 147,951,465 | 141.1 | 低配兜底 |
| `ggml-base-q5_1.bin` | base q5_1 | 59,707,625 | 56.9 | **极小体积兜底** |
| **`ggml-small.bin`** | **small 多语** | **487,601,967** | **465.0** | ← **当前内置** |
| `ggml-small-q5_1.bin` | small q5_1 | 190,085,487 | 181.3 | 省 61% 体积，质量略降 |
| `ggml-small-q8_0.bin` | small q8_0 | 264,464,607 | 252.2 | 省 46% 体积 |
| `ggml-medium.bin` | medium 多语 | 1,533,763,059 | 1462.7 | 偏重 |
| `ggml-medium-q5_0.bin` | medium q5_0 | 539,212,467 | 514.2 | 中等偏重 |
| `ggml-large-v3.bin` | large-v3 | 3,095,033,483 | 2951.7 | 精度天花板，3 GB 太重 |
| `ggml-large-v3-q5_0.bin` | large-v3 q5_0 | 1,081,140,203 | 1031.1 | 1 GB 折中 |
| **`ggml-large-v3-turbo-q5_0.bin`** | **turbo q5_0** | **574,041,195** | **547.4** | ⭐ **性价比最高** |
| `ggml-large-v3-turbo-q8_0.bin` | turbo q8_0 | 874,188,075 | 833.7 | 量化里精度最高 |
| `ggml-large-v3-turbo.bin` | turbo | 1,624,555,275 | 1549.3 | 精度最好但 1.6 GB |
| `ggml-small-encoder.mlmodelc.zip` | Core ML 编码器 | — | 155.5 | **仅 macOS**，ANE 加速 |
| `ggml-large-v3-turbo-encoder.mlmodelc.zip` | Core ML 编码器 | — | 1119.0 | 同上 |

**命名规则**（用来自查，不用猜）：
- **无后缀** = 多语言；**`.en`** = 仅英文
- **`-q5_0` / `-q5_1` / `-q8_0`** = 整数量化，数字越大越接近原精度、体积越大
- **`-tdrz`** = tinydiarize，标记"谁在说话的轮次"（**仅英文档**）
- **`-encoder.mlmodelc.zip`** = 只含编码器，**不是完整模型**，要配合对应 `.bin`
- ⚠️ **仓库里没有 `ggml-large-v3-q8_0.bin`**（v3 只有 q5_0），别照抄别人的文件名

### 6.2 ⭐ 立刻值得拿的三档

| 档 | 文件 | 体积 | 换来什么 | 代价 |
|----|------|------|----------|------|
| **T1 首选** | `ggml-large-v3-turbo-q5_0.bin` | 574,041,195 B（**比现在 +86.4 MiB / +18%**） | 参数量 244M → **809M**，同属官方仓库、MIT、whisper.cpp v1.8.4 **原生支持**（源码里已有 `g_aheads_large_v3_turbo`） | 包体涨 18%；CPU 推理约慢 1.5–2×（turbo 相对 large 仍快得多） |
| **T2 并行** | `ggml-small-q5_1.bin` | 190,085,487 B（**-61%**） | 低配机器/弱网可用的"轻量档" | 中文质量下降，需 A/B |
| **T3 精度档** | `ggml-large-v3-q5_0.bin` | 1,081,140,203 B（1.03 GiB） | 目前最准的多语 ggml 档 | 1 GB 下载 + 推理更慢 |

> **为什么 T1 值得**：`turbo` 是 OpenAI 对 `large-v3` 的**解码器瘦身版**（4 层解码器），参数量 809M；whisper.cpp v1.8.4 的源码里已含对应 aheads 表——【实测·抓取】`v1.8.4/src/whisper.cpp` 有 `g_aheads_large_v3_turbo` 与 `WHISPER_AHEADS_LARGE_V3_TURBO`。所以**不是"可能要支持"，是"已经支持"**。

**选型时真正要看的三个数**（否则容易只盯着"精不精"）：

| 型号 | 参数量 | 相对速度 | whisper.cpp 官方内存占用 | 本机需下载 |
|------|--------|----------|--------------------------|------------|
| tiny | 39 M | ~10× | ~273 MB | 74.1 MiB |
| base | 74 M | ~7× | ~388 MB | 141.1 MiB |
| **small（当前）** | **244 M** | **~4×** | **~852 MB** | **465.0 MiB** |
| medium | 769 M | ~2× | ~2.1 GB | 1462.7 MiB |
| **large-v3-turbo（T1 来源）** | **809 M** | **~8×** | 介于 medium 与 large 之间 | 547.4 MiB（q5_0） |
| large-v3 | 1550 M | 1× | ~3.9 GB | 2951.7 MiB / 1031.1 MiB（q5_0） |

【转引】参数量与相对速度来自 `openai/whisper` README；内存列来自 whisper.cpp README 的 "Memory usage" 表。

> **一句话读法**：T1 是"**用 18% 的体积，把内存从 ~852 MB 提到约 2 GB 档、把参数量翻 3.3 倍**"，同时因为 turbo 结构本身快，实际等待时间不会等比例变长。**对录屏字幕这种场景，这是目前最划算的一次交换。**

### 6.3 别忘了 VAD——**它不在这个仓库里**

这是本次最容易踩空的一个点：

- ❌ `ggerganov/whisper.cpp` 的 47 个文件里**没有** silero VAD
- ✅ VAD 在**另一个仓库**：`https://huggingface.co/ggml-org/whisper-vad`

| 文件 | 字节 | MiB | 许可 |
|------|------|-----|------|
| `ggml-silero-v5.1.2.bin` | 885,098 | 0.84 | mit |
| `ggml-silero-v6.2.0.bin` | 885,098 | 0.84 | mit |

**关键**：VAD 不是"把文件丢进去就生效"，**必须传参**：

```text
whisper-cli -m <模型> -f <wav> --vad -vm <ggml-silero-v6.2.0.bin> ...
```

【实测·抓取】`v1.8.4/examples/cli/cli.cpp` 中确认存在 `--vad` / `-vm` / `-vt` / `-vsd` 等参数。

**另一条独立佐证**：whisper.cpp 自己的下载脚本 `models/download-vad-model.sh` 里写的源地址就是 `https://huggingface.co/ggml-org/whisper-vad`，支持列表 `silero-v5.1.2 silero-v6.2.0`。【转引】`raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/download-vad-model.sh` —— 与我的实测路径一致，互为印证。

**为什么这对 Recordly 特别值**：
1. 项目现在的做法是**自己用 ffmpeg `silencedetect` 做静音检测，再重新断句**（`electron/ipc/captions/silence.ts`，注释里明确写"Whisper breaks speech on its own internal boundaries, not on real pauses"、"drops hallucinations"）。VAD 能**从模型侧**解决同一问题，且是官方维护路径。
2. 项目**已经把 `whisper-vad-speech-segments.exe` 从安装包里排除了**（`electron-builder.json5:28`），说明这条能力被有意/无意地关掉了。
3. 代价是 **0.84 MiB**。这是本文档里"单位体积收益最高"的一项。

### 6.4 中文场景：标点与说话人

| 想要什么 | 值得看的 | 许可 | 能不能直接用 |
|----------|----------|------|--------------|
| **中文 + 标点优化** | `BELLE-2/Belle-whisper-large-v3-turbo-zh-ggml` —— 文件 `ggml-model.bin`，**1549.3 MiB**，sha256 `2a3bba5bfdb4d4da3d9949a83b405711727ca1941d4d5810895e077eb3cb4d99` | **apache-2.0** | ⚠️ **格式对得上（ggml），可直接喂给 whisper-cli**；但 `likes=11 / downloads=0`，**社区零验证**，只能作为实验项 A/B，不建议做默认。同系列有官方说明其在 **AISHELL1 / AISHELL2 / WENETSPEECH / HKUST** 上做中文标点增强 |
| 中文标点（文本后处理） | `funasr/ct-punc`，`model.pt` = 1,125,507,622 B | apache-2.0 | ❌ 输入是**文本**不是音频；whisper.cpp 不吃这个格式，要另接 FunASR/ONNX |
| **说话人分离** | `pyannote/speaker-diarization-3.1`（`likes=3691`） | **mit**，但 **`gated=auto`** | ❌ 匿名实测 **401**：要登录 + 同意条件 + 留邮箱。**许可可商用，但获取有门槛，无法在应用里静默下载** |
| 说话人轮次（轻量） | whisper.cpp 的 `small.en-tdrz`（英文，tinydiarize） | — | ⚠️ 只在英文档；**HF 仓库 47 个文件里没有它，我未能核实下载地址** |
| 中文/粤语强、CPU 快 | `FunAudioLLM/SenseVoiceSmall`（`likes=481`） | **`other`** → FunASR MODEL_LICENSE（**须自读**） | ❌ 需 FunASR 运行时；其 GGUF 版走 **llama.cpp/audiocpp**，**不是 whisper.cpp** |

> 提醒：`SenseVoice` 的自我宣传（"中文/粤语有优势"、"10 秒音频 70ms"）来自**它自己的 model card**，且对比结果是**两张图片**，没有可引用的文字数字。本报告不做中文 ASR 的质量排名——**那需要统一测试集的实测，本次没做。**

### 6.5 别的模型家族：先认清"格式墙"

这是决定"能不能拿"的第一道门，比"哪个准"更重要：

| 运行时 | 吃的格式 | 例子 |
|--------|----------|------|
| **whisper.cpp**（本项目） | `ggml-*.bin`（whisper 架构） | `ggerganov/whisper.cpp` 全部文件、`BELLE-2/…-ggml` |
| llama.cpp / audiocpp | `.gguf` | `FunAudioLLM/SenseVoiceSmall-GGUF`、`cstr/*-GGUF` 系列 |
| CTranslate2（faster-whisper） | `model.bin` + `config.json` + `tokenizer.json` | `Systran/faster-whisper-*` |
| NeMo / Transformers | `.nemo` / safetensors | `nvidia/parakeet-*`、`nvidia/canary-*`、`mistralai/Voxtral-*` |
| FunASR / ONNX | `.pt` / `.onnx` | `funasr/Paraformer-large`、`funasr/ct-punc` |

**结论：跨格式的模型对 Recordly 就是"零可用"**，除非换运行时（那是另一个工程量级）。

值得留意但**当前拿不到**的：

| 系列 | 仓库 | 中文 | 许可 | 备注 |
|------|------|------|------|------|
| Parakeet TDT 0.6b v3 | `ggml-org/parakeet-GGUF`（`license=mit`，实测） | ❌ 25 种欧洲语言 | mit | ⚠️ 走**独立二进制 `parakeet-cli`**，不是 `whisper-cli`；whisper.cpp **v1.9.0 才加入**支持，我们钉的 v1.8.4 没有 |
| Parakeet TDT 0.6b v2 | `nvidia/parakeet-tdt-0.6b-v2` | ❌ 仅英文 | cc-by-4.0 | 英文很强（card 自报 LibriSpeech clean WER 1.69%），但格式不通 + 无中文 |
| distil-large-v3 | `distil-whisper/distil-large-v3-ggml`（`license=mit`，实测） | ❌ **仅 en** | mit | ggml 格式可加载，但**不支持中文**，且 whisper.cpp 文档警告"chunk-based 策略未实现，质量可能次优" |
| Canary / MMS | `nvidia/canary-1b` / `facebook/mms-1b-all` | 部分 | **`cc-by-nc-4.0`（禁商用）** | ⚠️ 若 Recordly 是商业产品，**直接排除** |
| Voxtral | `mistralai/Voxtral-Mini-3B-2507` | ❌ 无 zh | apache-2.0 | 3B LLM，CPU 不实际 |
| Fun-ASR Nano | `FunAudioLLM/Fun-ASR-Nano-2512` | ✅ | apache-2.0 | 需 Transformers/vLLM |
| 字节 Seed-ASR | — | — | — | 【转引】**未找到官方开源 HF 仓库**，不排除在 ModelScope |

### 6.6 在线调用（不下模型）

| 选项 | 免费额度 | 现实判断 |
|------|----------|----------|
| HF **Inference Providers** | 【转引】Free 用户 **$0.10/月**（原文标注 "subject to change"）；PRO **$2.00/月** | ❌ 对"转写整段录屏"**不具备生产可用性**，$0.10 约够几十分钟音频 |
| Spaces 上的 demo | 有基础 ZeroGPU 配额 | 适合**人工试听对比**，不适合集成 |

来源：【转引】`huggingface.co/docs/inference-providers/pricing`、`huggingface.co/pricing`

### 6.7 明确不划算 / 不要拿的

- **`for-tests-*.bin`**：**不在 HF 仓库里**，只在 GitHub `models/` 目录；官方说明是"**空文件（不含任何权重）**，供 CI 测试用"。对字幕功能**零价值**。
- **`-encoder.mlmodelc.zip`**：不是完整模型，只在 Apple Silicon 上配合 `.bin` 做 ANE 加速；Windows/Linux 无收益。
- **`whisper-bench / whisper-quantize / whisper-server`**：项目已经把它们排除出包（**这是对的**，继续排除）。
- **仓库 model card 表格里的 SHA 列**：**已过期**（我用 tiny 做了反证）。要校验走 API 的 `lfs.oid`。
- **`ggml-org/models-moved`**（下载量 51 万，看着很热）：实际是 bert / phi-2 / tinyllama 等 **LLM 的 GGUF**，与语音无关。
- **`cstr/*` 系列 GGUF ASR**：跑在 llama.cpp/audiocpp 路径，**不是 whisper.cpp**，且质量未经检验。

---

## 7. 对 Recordly 的三条具体行动（可直接开工）

| # | 动作 | 改动量 | 验收标准 |
|---|------|--------|----------|
| **A1** | 增加「更准」档：把 `ggml-large-v3-turbo-q5_0.bin`（574,041,195 B / sha256 `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`）加入可选或默认内置 | 低（常量 + 一个下拉/一个 extraResources 项） | 同一段中文录屏，A/B 对比 small；出错率与断句主观可辨改善 |
| **A2** | 下载器加固：① 超时按"无数据 30 s / 总时长不设死"；② 支持 Range 续传；③ **用 sha256 校验**（值见附录）；④ 域名可配置（`HF_ENDPOINT` 式的常量或设置项），镜像回退到 `hf-mirror.com`（并在 UI 注明"第三方镜像"） | 中 | 断网重连后从断点续；篡改文件被拒；弱网可切镜像成功 |
| **A3** | 启用 VAD：随包带 `ggml-silero-v6.2.0.bin`（885,098 B，仓库 `ggml-org/whisper-vad`，MIT），`whisper-cli` 加 `--vad -vm <path>`，并取消 `electron-builder.json5` 对 `whisper-vad-speech-segments` 的排除（如需该工具） | 低-中 | 长录屏静音段不再产生幻觉字幕；字幕断句落在真实停顿上 |

**顺带该补的一项（合规）**：`LICENSE.md` / README / 应用"关于"里**加第三方归属声明**——whisper.cpp（MIT）、OpenAI Whisper 权重（MIT）、ggml 模型来源 URL。现在全仓库 grep 不到任何 whisper 归属声明。

---

## 8. 风险与坑（会给将来埋雷的）

| # | 风险 | 证据 | 建议 |
|---|------|------|------|
| R1 | **引擎升级会撞上"上游不再发预编译包"** | 【实测·抓取】v1.9.3（2026-08-20）与 v1.9.4（2026-09-11）的 release **assets = 0**；v1.9.4 的 `whisper-bin-x64.zip` 实测 **404**；v1.9.0（2026-06-17）还有 9 个附件 | 若要从 v1.8.4 升，**最远只能升到 v1.9.2**（还有附件），或改用 nightly tag（如 v1.9.4 release 里点名的 `b5130`），或改走源码编译 |
| R2 | 引用可变分支 `main` + 无校验 | §4.6 D3/D5 | 钉 commit 或校验 sha256 |
| R3 | 单一模型托管站 + 单一域名 | §5.5、§5.7 | 可配置 + 镜像 + 本地缓存策略 |
| R4 | 许可**看起来统一其实不统一** | `openai/whisper-*` 在 HF 上多为 apache-2.0，唯独 turbo 是 mit；MMS/Canary v1 是 cc-by-**nc**；SenseVoice 是 `other` | 换任何模型前**先读 card 的 license**，不要按系列推断 |
| R5 | 门控模型不能静默下载 | `pyannote/segmentation-3.0` 匿名 401 | 说话人分离类需求要么做"引导用户登录"，要么放弃 |
| R6 | 版本钉死但**功能在跑**：v1.8.4 有 `--vad` 却没用 | 【实测·抓取】v1.8.4 cli.cpp | 不需要为 VAD 升级引擎，**当前版本就能做** |
| R7 | 与本项目直接相关的上游修复还没拿到 | v1.9.2 changelog 含 **"whisper : make voice_length() utf-8 aware for CJK"** 与 **"map token timestamps to original time when VAD is enabled"** | 做中文 + VAD 时这两条会真实影响结果，值得评估升级到 v1.9.2 |

---

## 9. 未知清单（核不实的，**不删只标**）

| # | 未知项 | 为什么重要 | 现状 |
|---|--------|------------|------|
| U1 | NVIDIA 收购 Hugging Face 是否**已交割** | 影响长期平台政策与可用性判断 | 多源报道一致（金额约 129 亿美元，2026-09-03 前后），**但权威原文正文我未能抓取**；维基 infobox 已写 `parent = Nvidia (100%)` 无日期脚注 |
| U2 | `huggingface.co` 在**中国大陆**当前真实可达性 | 决定下载器要塞多少兜底 | **我无法验证**（本机出口不在大陆）。可核实的只有"阿里云文档承认可能不通"+ 活跃的第三方镜像生态 |
| U3 | `hf-mirror.com` 的**运营主体** | 第三方站要评估可信度 | 首页有署名 `padeoe`、捐赠入口、微信交流群，**无主体名称/备案/协议公示**；未找到 HF 官方对它的任何授权声明 |
| U4 | `ggerganov/whisper.cpp` 的**真实下载量** | 判断生态热度 | 仓库 `trackDownloads: false`，API 与页面都返回 0，**只能给 likes=1593** |
| U5 | `small.en-tdrz` 的可下载地址 | 轻量说话人轮次 | HF 47 个文件里没有；HF 检索未命中；**未核实** |
| U6 | `Systran/faster-whisper-large-v3-turbo` | 社区常用 | 该 id 匿名请求 **401**，**无法判定**是不存在还是私有/门控 |
| U7 | 字节 Seed-ASR 是否开源 | 中文候选 | HF 未找到官方仓库；**未在 ModelScope 检索** |
| U8 | 各中文模型**统一口径**的真实排名 | 决定"哪个最准" | **本次没做跑分实测**。报告里所有"更准/更快"都是**模型方自述**，已逐条标注 |
| U9 | `BELLE-2/Belle-whisper-large-v3-turbo-zh-ggml` 的实际质量 | 唯一"原创作者组织发布 + ggml 中文" | 格式与许可都对（apache-2.0 / 1549.3 MiB），但 **likes=11、downloads=0** —— 零社区验证 |
| U10 | 各文件在**中国大陆**的实际下载速度 | 估算"用户要等多久" | 未测。仅有一手记录：走本机代理下 `ggml-small.bin` 约 **2 分钟** |

---

## 10. 附录：取证命令与原始输出

### 10.1 定位模型 URL（代码）

```powershell
# 全仓搜 huggingface / ggml
grep -rn "huggingface|hf\.co|ggml-org|ggerganov" --include=*.{ts,tsx,js,mjs,json,json5,md}
```

命中仅 3 处：

```text
electron/ipc/constants.ts:20        https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
scripts/build-whisper-runtime.mjs:136  https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.8.4.tar.gz
scripts/build-whisper-runtime.mjs:260  https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip
```

### 10.2 模型直链的一手响应头

```powershell
Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -Method Head -MaximumRedirection 5
```

```text
STATUS:        200
FINAL-URI:     https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/edd29d67…?response-content-type=application%2Foctet-stream&…&user_id=public&X-Xet-Cas-Uid=public&Expires=…&Signature=…&Key-Pair-Id=…
CONTENT-LENGTH: 487601967
CONTENT-TYPE:  application/octet-stream
```

### 10.3 权威体积与 sha256（HF tree API）

```powershell
Invoke-RestMethod -Uri 'https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main'
# 取每个条目的 .lfs.size 与 .lfs.oid
```

关键条目：

```text
ggml-small.bin                 bytes=487601967  sha256=1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b
ggml-large-v3-turbo-q5_0.bin   bytes=574041195  sha256=394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2
ggml-small-q5_1.bin            bytes=190085487  sha256=ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
ggml-tiny.bin                  bytes= 77691713  sha256=be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21
```

### 10.4 sha256 反证（证明 model card 的 SHA 列不可用）

```powershell
Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' -OutFile $tmp
(Get-FileHash $tmp -Algorithm SHA256).Hash
```

```text
实算 sha256  = be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21   ✅ 与 API lfs.oid 一致
model card 写 = bd577a113a864445d4c299885e0cb97d4ba92b5f                              ❌ 对不上（已过期）
```

### 10.5 引擎 zip 校验（通过）

```powershell
Invoke-WebRequest 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip' -OutFile $z
(Get-FileHash $z -Algorithm SHA256).Hash
```

```text
bytes  = 4078768
sha256 = 74f973345cb52ef5ba3ec9e7e7af8e48cc8c71722d1528603b80588a11f82e3e   ✅ 与脚本里钉的值一致
zip 内容（21 项）：Release/whisper-cli.exe(485888) + whisper.dll + ggml.dll + ggml-base.dll + ggml-cpu.dll
                  + whisper-server.exe / whisper-bench.exe / whisper-quantize.exe /
                    whisper-vad-speech-segments.exe / SDL2.dll / 若干示例 exe
```

### 10.6 上游版本与"断供"证据

```powershell
Invoke-RestMethod 'https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest'
Invoke-RestMethod 'https://api.github.com/repos/ggml-org/whisper.cpp/releases/tags/v1.8.4'
Invoke-RestMethod 'https://api.github.com/repos/ggml-org/whisper.cpp/releases/tags/v1.9.4'
```

```text
latest tag        = v1.9.4   published 2026-09-11   assets = 0        ← 无附件
v1.9.0            published 2026-06-17   assets = 9   （含 whisper-bin-x64.zip 5.2 MiB）
v1.8.4            published 2026-03-19   assets = 8   （whisper-bin-x64.zip 3.9 MiB，downloads 55,809）
HEAD v1.9.4/whisper-bin-x64.zip → 404
HEAD v1.8.4/whisper-bin-x64.zip → 200 (4,078,768 B)
repo              = ggml-org/whisper.cpp   license = MIT   stars = 53,710
```

### 10.7 VAD 模型（另一个仓库）

```powershell
Invoke-RestMethod 'https://huggingface.co/api/models/ggml-org/whisper-vad'
```

```text
id=ggml-org/whisper-vad   license=mit   likes=23   gated=False   lastModified=2025-11-17
ggml-silero-v5.1.2.bin   885098 B   sha256=29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf
ggml-silero-v6.2.0.bin   885098 B   sha256=2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987
```

### 10.8 v1.8.4 确实支持 VAD 与 turbo（源码级）

```text
v1.8.4/examples/cli/cli.cpp  →  --vad / -vm / -vt / -vspd / -vsd / -vmsd / -vp / -vo 全部存在
v1.8.4/src/whisper.cpp       →  g_aheads_large_v3_turbo + WHISPER_AHEADS_LARGE_V3_TURBO 已存在
```

### 10.9 镜像可用性

```text
HEAD https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
  → 200, Content-Length = 487601967   （与官方完全一致）
hf-mirror.com 首页 meta: "加速访问Hugging Face的门户。作为一个公益项目…镜像服务…"
```

### 10.10 本机状态

```text
%APPDATA%\Recordly           → 不存在（打包态从未跑过/未下过模型）
%APPDATA%\Recordly-dev       → 存在，含 recordings / app-settings.json / session / …，但【无 whisper 子目录】
electron/native/bin/win32-x64 → cursor-monitor.exe, helpers-manifest.json,
                                recordly-gpu-export.exe, recordly-nvidia-cuda-compositor.exe, wgc-capture.exe
                                【无 whisper-cli.exe】→ Windows 侧需先跑 npm run build:whisper-runtime
electron/native/bin/darwin-arm64 → 有 whisper-cli(3116664) / whisper-bench / whisper-quantize /
                                whisper-server / whisper-vad-speech-segments / whisper-runtime.json
.gitignore:41-42 → electron/native/bin/*/whisper-* 与 whisper-runtime.json 均不入库
```

### 10.11 关键源码行号索引

| 主题 | 位置 |
|------|------|
| 下载 URL / 落盘路径常量 | `electron/ipc/constants.ts:19-22` |
| 下载实现（30 s 超时、5 跳重定向、无校验） | `electron/ipc/captions/whisper.ts:41-151` |
| 状态探测（只认 userData 一个路径） | `electron/ipc/captions/whisper.ts:24-39` |
| 删除模型（只删 userData） | `electron/ipc/captions/whisper.ts:153-155` |
| whisper-cli 参数（无 `--vad`） | `electron/ipc/captions/generate.ts:248-259` |
| 静音检测与重断句（自研替代 VAD） | `electron/ipc/captions/silence.ts`、`generate.ts:189-211,294-310` |
| 引擎解析优先级 | `electron/ipc/captions/generate.ts:61-101`、`electron/ipc/paths/binaries.ts:83-90` |
| 模型选择器（只滤 `.bin`） | `electron/ipc/register/captions.ts:141-148` |
| 界面三态（下载/删除/生成） | `src/components/video-editor/SettingsPanel.tsx:2335-2399` |
| 中文界面文案 | `src/i18n/locales/zh-CN/settings.json:169-196` |
| 打包排除项 | `electron-builder.json5:24-28` |
| dev 与正式 userData 分叉 | `electron/appPaths.ts:4-8` |

---

## 附：本次调查的自我体检

- [x] 有明确假设（5 条，含 1 条反例假设 H5）
- [x] 事实表六问齐，每行有来源与可信度
- [x] **专门找了反例**：① `dev-creator` 上已有同类调查（避免重复劳动）；② 用 tiny 的实算 sha256 **推翻了** model card 的 SHA 列；③ 确认"本机能访问 HF"**不能**证明"国内能访问"
- [x] 标-本-药三段齐，"药"是三条可开工的具体动作
- [x] 有未知清单（10 条，核不实的没删）
- [x] 结论每条能追到事实表某行
- [x] 估算/推断处均标注（如 F9、U2、U10）
