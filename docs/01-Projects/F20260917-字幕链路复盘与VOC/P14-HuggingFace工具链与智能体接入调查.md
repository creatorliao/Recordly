# P14 · Hugging Face 工具链与智能体接入调查

> 本文档为 `F20260917-字幕链路复盘与VOC` 的补充产出（P14）。
> **三问**：① 有没有像 `gh`（GitHub CLI）那样的 HF 命令行工具？② 能不能判断"这个模型在**我这台机器**上跑不跑得动"？③ 有没有 CI 能力、能不能让智能体自己连上去找模型？
> **重点**：Hugging Face 官方能力为主线，GitHub 开源生态为辅。
> **证据等级**：`【实测·本机】`=本机真跑；`【转引】`=子调研实取页面/API 并附 URL，我未独立复跑；`【更正】`=推翻了我原先的说法。

---

## 一、结论先行（30 秒版）

1. **有，而且就是官方的**：`hf` CLI —— 由 `huggingface-cli` 在 **huggingface_hub v0.34.0**（2025-07-25）改名而来，**v1.0.0（2025-10-27）起旧名彻底删除**。本机实测装到 **1.31.0**，**22 个顶层命令、182 个命令标题**，覆盖 `models / download / upload / cache / jobs / sandbox / skills / repos / datasets / spaces / webhooks / extensions` 等。【实测·本机】+【转引】

2. **⚠️ 但本机直接装完是"连不上"的**：`hf` 走 Python httpx，**不读 Windows 系统代理**，而本机 `huggingface.co` 需要代理。实测：直连 **ConnectTimeout 49.3 s**，挂 `HTTPS_PROXY=http://127.0.0.1:1080` 后 **2.7 s 成功**。同一时刻 PowerShell 的 `Invoke-WebRequest` 直连返回 **200**。【实测·本机】 → **这是用 `hf` 的第一道门槛，见 §二。**

3. **对"找模型"最直接的三条命令**（都已实测跑通）：
   - `hf models ls --search / --pipeline-tag / --apps ollama / --num-parameters min:6B,max:128B / --sort downloads` —— **在终端里按任务、按规模、按"能被哪个运行时跑"筛模型**
   - `hf models ls <repo> -h --tree` —— **直接列出仓库文件与人类可读体积**（这就是"判断能不能跑"的第一步）
   - `hf models info <repo> --expand gguf` —— 取 GGUF 元数据

4. **"能不能在本机跑"：官方有，但官方给的是"资材 + Web 面板"，不是判定器。** 官方文档确实有 **Hardware compatibility 面板**（登记硬件后，GGUF/MLX 模型页会估算每个量化能否跑）+ `hardwareItems` API；但**没有任何官方 API 返回"能/不能"的布尔结论**，面板公式也要登录才看得到（未能核实）。**判定要么用社区工具（`llmfit` 等），要么自己按公式算，要么真跑一遍。**【转引】

5. **【更正】社区估算公式里"q5≈0.7 / q4≈0.55 字节/参数"这个说法找不到权威出处。** 有出处的真值来自 ggml 的 block 尺寸反算：**Q4_K = 0.5625、Q5_K = 0.6875、Q8_0 = 1.0625、F16 = 2.0 B/参数**。以后引用请用这组。

6. **【更正·重要】`whisper.cpp` 不支持 `-hf`。** 我在上一轮报告里把"whisper-cli 是否支持 `-hf`"列为待核实项——**结论是没有**。本机复核：v1.9.2 的 `whisper-cli --help` 里 **`hf` 相关选项命中 0 条**，模型入口只有 `-m/--model` 与 `-vm/--vad-model`。【实测·本机】子调研另用五重取证（usage 表 60+ 项无 hf、源码全量 grep 零命中、文件树无 `hf-cache.cpp`、30 条 release notes 零命中、该功能只是 **未合并的 PR #3922**）交叉确认。【转引】<br>→ **官方唯一路径**是 `models/download-ggml-model.sh <model>`，落到 `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<model>.bin`；**没有 `repo:q5_0` 式语法**（量化档是仓库里预转换好的独立 `.bin`）。

7. **CI：官方这一条链是齐的**（都已核实存在）：`hf jobs` / `hf sandbox`（在 HF 自己的算力上跑，实测有完整价目表：`cpu-basic` $0.01/h、`t4-small` $0.40/h、`a10g-small` $1.00/h、`a100-large` $2.50/h、`h200` $5.00/h）＋ GitHub Actions 三件套：**`huggingface/hub-sync`（现役官方）**、`hf-jobs-action`、以及**能把 GitHub Actions 的 `runs-on` 直接换成 `hf-jobs-a10g-small` 的 `jobs-actions`**。【实测·本机】+【转引】<br>【更正】`huggingface/upload-to-hub` 与 `huggingface/sync-datasets` **两个 Action 都不存在（404）**，别照抄旧文章。

8. **让智能体自己连：官方已经有了，而且很成熟。** `hf skills` 就是一个**官方智能体技能市场**（本机实测列出 **20 个技能**，含 `hf-cli`、**`hf-mem`（估算 Safetensors/GGUF 显存需求）**、`huggingface-local-models`（选本地可跑的 llama.cpp/GGUF 模型）、`huggingface-best`（按榜单推荐模型）），支持装到项目级/全局、面向 Claude 或通用。此外有官方 **MCP Server**（`https://huggingface.co/mcp`，需 token）、`tiny-agents`、`huggingface_hub.MCPClient`。【实测·本机】+【转引】<br>而**第三方 HF 专用 MCP 很薄**：最高星只有 389★ 且已 15 个月未更新 → **这条线只押官方**。

---

## 二、⚠️ 本机拦路虎：`hf` 装上了，但默认连不通

### 2.1 实测现象

| 检查 | 结果 |
|:--|:--|
| `hf models ls --limit 3`（无代理） | ❌ `httpx.ConnectTimeout: [WinError 10060]`，**耗时 49.3 s** |
| 同一时刻 `Invoke-WebRequest https://huggingface.co/api/models?limit=1` | ✅ **HTTP 200** |
| 同一时刻 `python socket.create_connection(('huggingface.co',443))` | ❌ `TimeoutError` |
| `hf models ls --limit 5`（挂 `HTTPS_PROXY` 后） | ✅ **2.7 s 返回表格** |

### 2.2 为什么

| 项 | 值 |
|:--|:--|
| Windows 系统代理开关 | `ProxyEnable = 0`（**关闭**），`ProxyServer = localhost:1080`（已配置但未启用） |
| 本机代理端口实况 | `127.0.0.1:1080` **在监听**；1087 / 7890 / 7897 / 10809 均未监听 |
| 结论 | 不走系统代理设置。`hf` 用 **Python httpx**，**不自动继承 Windows 的系统代理**；而 PowerShell 的 `Invoke-WebRequest` 走 .NET，有别的路径能通 |

### 2.3 解法（用 `hf` 前先做这一步）

```powershell
$env:HTTPS_PROXY = 'http://127.0.0.1:1080'
$env:HTTP_PROXY  = 'http://127.0.0.1:1080'
hf models ls --limit 5          # 2.7s 出结果
```

> 想持久化就写进用户环境变量。**注意**：这同时解释了为什么 DSH 的 `web_fetch` 抓 `huggingface.co` 会 `fetch failed`，而 PowerShell 抓得动——同一台机器、不同 HTTP 栈。

### 2.4 怎么装的（本机已验证可复现）

```powershell
# 本机无 python/pip，但有 uv（C:\Users\creator\AppData\Local\hermes\bin\uv.exe）
$env:UV_TOOL_BIN_DIR='D:\_hf_tools\bin'
uv tool install "huggingface-hub[cli]"
# → huggingface-hub==1.31.0，装入 3 个可执行：hf / huggingface-cli / tiny-agents
```

⚠️ 实测警告：`warning: The package 'huggingface-hub==1.31.0' does not have an extra named 'cli'` 【实测·本机】
→ **v1.0 起 `[cli]` extra 已取消，CLI 并入核心包**（与【转引】的迁移文档一致）。装的时候带不带 `[cli]` 都能用。

---

## 三、Q1：有没有像 `gh` 那样的 HF CLI？—— **有，就是官方的 `hf`**

### 3.1 改名史（【转引】）

| 事实 | 证据 |
|:--|:--|
| 官方博客逐字："the Hugging Face CLI has been officially renamed from `huggingface-cli` to `hf`" | https://huggingface.co/blog/hf-cli |
| 改名版本 **v0.34.0**，PyPI 上传 **2025-07-25** | https://pypi.org/pypi/huggingface_hub/json |
| 0.x 期旧名仍可用并打弃用警告 | 同上博客 |
| **v1.0.0（2025-10-27）删除 `huggingface-cli`**，迁移文档逐字："The deprecated `huggingface-cli` has been removed, `hf` (introduced in v0.34) replaces it" | https://raw.githubusercontent.com/huggingface/huggingface_hub/main/docs/source/en/concepts/migration.md |
| v1.0 同时：移除 `hf_transfer` 支持（改用 `HF_XET_HIGH_PERFORMANCE`）、HTTP 后端由 `requests` 换 `httpx`、`hf cache scan/delete` 改为 `ls/rm/prune` | 同上 |
| 当前最新 **1.31.0**（2026-09-10），Apache-2.0，`requires-python >=3.10` | PyPI |

> **一句话**：`gh` ↔ GitHub 的关系，≈ `hf` ↔ Hugging Face。**结构上也是 `hf <资源> <动作>`**（如 `hf models ls`、`hf auth whoami`），和 `gh repo list` 一个路数。

### 3.2 本机实测：装了哪些命令

```text
$ hf --version
1.31.0

$ hf --help
Main commands:
  auth / buckets / cache / collections / cp / datasets / discussions / download /
  endpoints / extensions(ext) / jobs / models / papers / repos(repo) / sandbox /
  skills / spaces / sync / upload / upload-large-folder(DEPRECATED) / webhooks
Help commands: env / update / version
```

**22 个顶层命令**（【转引】官方 CLI 参考页共 182 个命令标题）。与本议题强相关的五个：

| 命令 | 一句话 | 对本议题的意义 |
|:--|:--|:--|
| `hf models` | `card` / `info` / `list(ls)` | **找模型、看体积、看元数据** |
| `hf download` | 下载（含 `--dry-run`） | 落地权重 |
| `hf cache` | `ls` / `rm` / `prune` / `verify` | 本机缓存治理 |
| `hf jobs` | 在 HF 算力上跑任务 | **CI / 实测** |
| `hf skills` | **给智能体装技能** | **让 agent 自己会用 hf** |

### 3.3 【实测·本机】三条"找模型 / 判体积"命令的真实输出

**(a) 按任务筛模型 + 按下载量排序**

```powershell
hf models ls --pipeline-tag automatic-speech-recognition --sort downloads --limit 5
```
```text
ID          CREATED_AT DOWNLOADS LIBRARY_NAME  LIKES PIPELINE_TAG
jonata...   2022-03-02  16925814 transformers     87 automatic-speech-recognition
argmax...   2024-02-28  11230874 whisperkit      228 automatic-speech-recognition
pyanno...   2023-11-16   8467858 pyannote-...   3692 automatic-speech-recognition
openai...   2024-10-01   6787988 transformers   3361 automatic-speech-recognition
```

`hf models list --help` 的可用过滤项（【实测·本机】原文摘录）：

| 选项 | 用途 |
|:--|:--|
| `--search` / `--author` / `--filter` / `--pipeline-tag` | 关键字 / 作者 / 标签 / 任务 |
| `--gated / --no-gated` | 是否门控（**门控=要登录+同意条件**） |
| **`--apps TEXT`** | **按"能被哪个运行时跑"筛**，官方例子 `'ollama'` 或 `'vllm'` |
| **`--num-parameters TEXT`** | **按规模筛**，语法 `'min:6B,max:128B'` |
| `--inference-provider` / `--warm` | 按推理供应商 / 只列当前有服务在跑的 |
| `--sort [created_at\|downloads\|last_modified\|likes\|trending_score]` / `--limit` | 排序与截断 |
| `--expand TEXT` | 只取指定字段（可选值含 **`gguf`**、`safetensors`、`config`、`usedStorage`…） |
| **`--format [auto\|human\|agent\|json\|quiet]`** | ⭐ **有专门的 `agent` 输出格式**——官方明摆着给智能体用的 |

**(b) 列仓库文件与体积（"能不能跑"的第一步）**

```powershell
hf models ls ggerganov/whisper.cpp -h --tree
```
```text
  1.2 GB  ├── ggml-large-v3-turbo-encoder.mlmodelc.zip
574.0 MB  ├── ggml-large-v3-turbo-q5_0.bin
874.2 MB  ├── ggml-large-v3-turbo-q8_0.bin
  1.6 GB  ├── ggml-large-v3-turbo.bin
190.1 MB  ├── ggml-small-q5_1.bin
487.6 MB  ├── ggml-small.bin
```
→ **一条命令就把 P00 报告里那些体积数字从 Hub 侧直接读出来**，不用下载。

**(c) 官方智能体技能市场（这条最关键）**

```powershell
hf skills list --no-truncate --format json
```
实测列出 **20 个技能**，与本议题直接相关的四个（描述为原文）：

| 技能 | 官方描述 |
|:--|:--|
| `hf-cli` | Hugging Face Hub CLI (`hf`) for downloading, uploading, and managing models, datasets, spaces, buckets, repos, papers, jobs, and more |
| **`hf-mem`** | **Hugging Face CLI to estimate the required memory to load Safetensors or GGUF model weights for inference from the Hugging Face Hub** |
| **`huggingface-local-models`** | **Use to select models to run locally with llama.cpp and GGUF on CPU, Mac Metal, CUDA, or ROCm** |
| `huggingface-best` | 按榜单推荐"最好的模型"给某任务 |

还有 `huggingface-community-evals`（本地硬件跑评测）、`huggingface-spaces`、`huggingface-llm-trainer`、`hf-cloud-*`（AWS SageMaker 一串）等。

**安装方式**（【转引】官方文档）：`hf skills add --global` / `hf skills add --claude`；安装器默认已带（`hf --help` 的 stderr 会提示 `Run 'hf skills add -g --claude'`【实测·本机】）。

> **这条回答了你问的"让智能体连接上去"**：不用自己写工具——**官方直接发技能，装进 agent 后它就知道怎么用 `hf` 找模型、估显存、选本地可跑的模型**。

### 3.4 下载能力（【转引】官方 CLI 参考页 + 【实测·本机】`--help`）

`hf download REPO_ID [FILENAMES]...` 实测选项：

| 选项 | 说明 |
|:--|:--|
| `--type/--repo-type [model\|dataset\|space]` | 默认 model |
| `--revision` | branch / tag / commit（PR 用 `refs/pr/N`） |
| `--include` / `--exclude` | glob，如 `--include "*.gguf"` |
| `--local-dir` / `--cache-dir` | 落盘位置 |
| `--force-download` | 强制重下 |
| **`--dry-run`** | **只列将下载的文件，不实际下**（= 下载前先算体积） |
| `--max-workers`（默认 8） / `--token` | 并发与鉴权 |

- **断点续传**：v1.0 起移除 `resume_download` 等参数，改由 `local_dir/.cache/huggingface/` 元数据 + HTTP Range 实现增量。【转引】
- **加速后端**：`hf_transfer` **已废弃**，改 **`hf_xet`**（本机装到 `hf-xet==1.6.0`【实测·本机】；默认自适应并发 1→64 流，`HF_XET_HIGH_PERFORMANCE=1` 提高上限）。【转引】
- **代理白名单**：官方给了一份防火墙 hostname 清单（含 `cas-server.xethub.hf.co`、`transfer.xethub.hf.co`、`us.aws.cdn.hf.co`、`cdn-lfs-us-1.hf.co`），并有机器可读清单 `https://huggingface.co/.well-known/meta.json`。【转引】→ **公司网络放行时按这份清单走。**

### 3.5 其它官方客户端（对照，【转引】）

| 客户端 | 定位 | 关键点 |
|:--|:--|:--|
| `huggingface_hub`（Python 库） | 编程接口 | `HfApi.list_models()` 支持同一批过滤（含 `apps`、`num_parameters`、`expand="gguf"`）；⚠️ v1.0 起 `library/language/tags/task` 参数被移除，统一走 `filter` |
| `@huggingface/hub`（JS/TS） | **可纯 Node 用，不需要 Python** | 2.17.2 / MIT；有 `listModels` / `modelInfo` / `snapshotDownload` / `downloadFileToCacheDir` / `scanCacheDir`；还带 CLI `npx @huggingface/hub upload ...` |
| `hf-hub`（Rust） | 官方 Rust 客户端 | 330★ / Apache-2.0，带 `hfrs` CLI |
| OpenAI 风格对照 | — | 无官方"模型管理器"；模型管理就是 `hf` |

---

## 四、Q2：能不能判断"这个模型在**我这台机器**上跑不跑得动"？

### 4.1 官方有，但**不是判定器**（【转引】+【更正】）

【更正】我原以为"官方完全没有这个能力"，**不准确**。官方确实有，分三层，但都不是"给个布尔结论"：

| 层级 | 能力 | 说明 |
|:--|:--|:--|
| ① **Web 面板**（最接近"判定"） | **Hardware compatibility 面板** | 官方文档逐字："On model pages that offer **GGUF or MLX files**, a **Hardware compatibility** panel estimates whether each quantization will run on your saved hardware, so you can choose a size that fits before downloading." 需先在 https://huggingface.co/settings/hardware 登记 GPU/CPU/Apple Silicon 与内存 |
| ② 硬件数据 API | `GET /api/users/{u}/overview` → `hardwareItems[{sku,mem,num,isPrimary}]`；`/oauth/userinfo`（profile scope）同 | 可用于程序化读取"我有什么卡" |
| ③ CLI 硬过滤 | `--apps llama.cpp`、`--num-parameters min:6B,max:128B`、`--warm` | **比"推荐"更确定**，但**没有显存维度** |

**但**：**没有任何官方 API 返回"这个模型在你这台机器上能不能跑"**；面板的判定公式在登录墙后，**未能核实**；`huggingface_hub` 里**也没有 GGUF 解析器**（`serialization/` 下只有 `_base/_torch/_dduf`，无 `_gguf.py`）。【转引】

### 4.2 官方最实用的一手数据源：`?blobs=true` 的 `gguf.*`（【转引】，我已在 P00 用过同款 API）

```bash
curl "https://huggingface.co/api/models/<repo>?blobs=true"
```
除每个文件的精确 `size` 外，GGUF 仓库会额外返回：
```text
gguf.total  gguf.architecture  gguf.context_length  gguf.totalFileSize
```
实测样例（`unsloth/Qwen3-0.6B-GGUF`）：`gguf.total=596049920`、`gguf.architecture=qwen3`、`gguf.context_length=40960`，siblings 列各量化档精确字节（Q2_K 296 MB、IQ4_XS 367 MB…）。
→ **不下载就能拿到"参数量 × 每个量化档的体积"**，这是自建判定的最佳输入。CLI 侧对应 `hf models info <repo> --expand gguf`。

### 4.3 社区"判定器"横向表（【转引】，均已核实存在）

| 项目 | 形态 | Star | 最近推送 | 许可 | 自动探测本机硬件 | 支持量化档 |
|:--|:--|--:|:--|:--|:--:|:--|
| **AlexsJones/llmfit** | CLI+TUI+Web+API | **36682** | 2026-09-16 | MIT | ✅ | GGUF Q2_K–Q8_0、AWQ/GPTQ、MLX 4/8bit |
| Andyyyy64/whichllm | CLI（PyPI） | 6646 | 2026-09-14 | MIT | ✅ | ✅ |
| signerless/llm-checker | CLI + **内置 MCP** | 2973 | 2026-09-06 | **NPDL-1.0（非 OSI）** | ✅ | ✅ |
| RahulSChand/gpu_poor | 网页 | 1403 | 2024-12-03 | **无 LICENSE 文件** | ❌ 手填 | GGML/QLoRA/vLLM |
| midudev/canirun.ai | 网页 | 409 | 2026-08-30 | **无 LICENSE 文件** | ✅ 浏览器探测 | 7 档 |
| KolosalAI/model-memory-calculator | 网页 | 85 | 2026-01-20 | MIT | ❌ | **解析 GGUF 头** |
| gdevenyi/huggingface-estimate | 网页+Node CLI | 28 | 2026-07-20 | **无 LICENSE 文件** | ✅（传 `--vram/--ram`） | 解析 GGUF 头 |
| HF Space `Vokturz/can-it-run-llm` | Streamlit | 1047 likes | 2025-02-04 | GPL-3.0 | ❌ | fp32/fp16/int8/int4 |
| HF Space `oobabooga/accurate-gguf-vram-calculator` | Gradio | 93 likes | 2026-08-17 | MIT | ❌ | **符号回归实测公式（19517 次真测，中位误差 365 MiB）** |
| `llama.cpp` 自带 **`llama-fit-params`** | C++ 工具 | 128k | 2026-09-17 | MIT | ✅ **不估算，直接实测** | 任意真实 GGUF |

**首选建议**：`AlexsJones/llmfit`（MIT、36.7k★、自动探测本机硬件、活跃）。**注意**它不读本地 `.gguf`，用内置模型库估算。

⚠️ **许可提醒**：`gpu_poor`、`huggingface-estimate`、`canirun.ai`、`CanIRunThisLLM` 都是 **README 有许可声明但仓库无 LICENSE 文件**，授权状态有法律不确定性；`llm-checker` 是 **NPDL-1.0（禁止付费分发/托管）**，**源码可见但非 OSI 开源**。

### 4.4 【更正】估算公式：把没有出处的数字换掉

**我原先在调研任务书里写的"q5≈0.7 / q4≈0.55 字节/参数"找不到权威出处**。子调研明确标了这一点，并给了可引用来源。

**有出处的真值 —— 由 ggml 的 block 尺寸反算**（源：`llama.cpp/gguf-py/gguf/constants.py` 的 `GGML_QUANT_SIZES`，格式 `(block_size, type_size)`，`QK_K=256`；`ggml-common.h` 注释给出同数）：

| 量化 | block | 每参数字节 | 来源注释原文 |
|:--|:--|--:|:--|
| F32 | (1,4) | 4.0 | — |
| F16 | (1,2) | 2.0 | — |
| Q8_0 | (32,34) | **1.0625** | — |
| Q6_K | (256,210) | **0.8203** | "Effectively 6.5625 bits per weight" |
| **Q5_K** | (256,176) | **0.6875** | "Effectively 5.5 bits per weight" |
| **Q4_K / Q4_0** | (256,144)/(32,18) | **0.5625** | "Effectively 4.5 bits per weight" |
| Q3_K | (256,110) | 0.4297 | "Effectively 3.4375 bits per weight" |
| Q2_K | (256,84) | 0.3281 | "Effectively 2.625 bits per weight" |

**总式（多个独立来源一致）**：
```text
所需内存 ≈ 权重字节 + KV cache + 激活/框架开销
权重字节 = 参数量 × 每参数字节
```
| 出处 | 关键逐字 |
|:--|:--|
| EleutherAI《Transformer Math 101》 | "In fp16 and bf16, `(2 bytes/param) · (No. params)`"；"In our experience this overhead is **≤ 20%**"；"`Total Memory_Inference ≈ (1.2) × Model Memory`" |
| kipply《Transformer Inference Arithmetic》 | KV cache 每 token `2 · 2 · n_layers · n_heads · d_head` |
| **`gpu_poor` README**（独立可复现） | "Cuda etc. overhead = Around 500-1GB … I assume **650 MB** overhead"；给出 3b/7b/13b 实测对比，误差 <500 MB |
| `llmfit` 实现（Rust） | `model_mem = params_b × quant_bpp`；`kv_bytes = 2·n_layers·n_kv_heads·head_dim·ctx·dtype`；`overhead = 0.5 GB`；阈值 `≤60% Perfect / ≤85% Good / ≤98% Marginal / >98% Too Tight` |
| HF `accelerate` 官方估算器 | `accelerate estimate-memory bert-base-cased` → fp32 418 MB / fp16 207 MB / int8 103 MB / int4 52 MB（**用 meta device 空实例化，不真加载**） |

### 4.5 回到 whisper / ggml：**社区没有成熟工具**

| 事实 | 内容 |
|:--|:--|
| **官方经验表（唯一权威）** | whisper.cpp README 的 Disk/Mem 表**只有 5 档基础模型**：tiny 75 MiB/~273 MB、base 142 MiB/~388 MB、**small 466 MiB/~852 MB**、medium 1.5 GiB/~2.1 GB、large 2.9 GiB/~3.9 GB。**量化档不给内存值。** |
| 唯一找到的 Whisper 专用估算器 | `absent1706/whisper-vram-calculator` —— **0★、无 LICENSE、单 HTML 玩具** |
| 第三方实测对照（最可引用） | `faster-whisper` README 表：openai/whisper fp16 beam5 = 2m23s/**4708 MB**；**whisper.cpp (Flash Attention) fp16 beam5 = 1m05s/4127 MB**；faster-whisper int8 = 59s/**2926 MB** |
| 结论 | **没有任何工具能读 Whisper 的 ggml 元数据做估算。** |

**但本项目的实际值我们已经在 P13 用真跑测出来了**，比任何估算器都准：

| 模型 | P13 实测峰值工作集 | 官方表 |
|:--|--:|--:|
| `ggml-small.bin` (465 MiB) | **882 MiB** | ~852 MB |
| `ggml-large-v3-turbo-q5_0.bin` (547 MiB) | **932 MiB** | 未给 |
| `ggml-small.bin` 在 GPU 上 | 主机工作集 385 MiB / **显存峰值 1025 MiB** | — |

→ **可以直接说：换 turbo-q5_0 内存只涨 50 MiB，内存不是障碍，时间才是。**（这条已经写进 P13，此处作为"判定方法"的实例。）

### 4.6 最硬的验证方式：**别估算，真跑**

| 手段 | 说明 |
|:--|:--|
| `llama-fit-params --model x.gguf` | **读真实 GGUF + 读空闲显存 → 反解出可行参数**（`-c 4096 -ngl 48 ...`），并打印内存分解。这是"真值"路线 |
| `llama_memory_breakdown_print` | llama.cpp 运行/加载时打印 `24077 = 945 + (19187 = 17904 + 384 + 898) + 3945` 这样的分解 |
| **`hf jobs run --flavor <档> ...`** | **在目标硬件上跑一遍**（见 §5.1），唯一能"实测替代估算"的云端路径 |
| 本机任务管理器 / `nvidia-smi` 采样 | 我们做 P13 用的就是这个（250 ms 采样取峰值） |

---

## 五、Q3：CI 能力与智能体接入

### 5.1 `hf jobs` / `hf sandbox`（【实测·本机】价目表 + 【转引】机制）

**是什么**：在 HF 自己的 CPU/GPU 上跑 Docker 镜像或 UV Python 脚本。【转引】官方逐字："Hugging Face Jobs runs your code on remote CPUs and GPUs."

**实测的硬件档与价格**（`hf jobs hardware`，节选）：

| 档名 | CPU | RAM | 加速器 | $/分钟 | $/小时 |
|:--|--:|--:|:--|--:|--:|
| `cpu-basic` | 2 vCPU | 16 GB | — | 0.0002 | **0.01** |
| `cpu-upgrade` | 8 vCPU | 32 GB | — | 0.0005 | 0.03 |
| `cpu-xl` | 16 vCPU | 124 GB | — | 0.0167 | 1.00 |
| **`t4-small`** | 4 vCPU | 15 GB | **1× T4** | 0.0067 | **0.40** |
| `t4-medium` | 8 vCPU | 30 GB | 1× T4 | 0.0100 | 0.60 |
| **`a10g-small`** | 4 vCPU | 15 GB | **1× A10G** | 0.0167 | **1.00** |
| `a10g-large` | 12 vCPU | 46 GB | 1× A10G | 0.0250 | 1.50 |
| `a100-large` | 12 vCPU | 142 GB | 1× A100 | 0.0417 | **2.50** |
| `h200` | 23 vCPU | 256 GB | 1× H200 | 0.0833 | 5.00 |

**子命令**（实测 `hf jobs --help`）：`run / logs / wait / cancel / inspect / list(ls,ps) / stats / ssh / labels / scheduled / hardware / uv`
**`hf sandbox`**（实测）：`create`（默认独占 VM，或便宜的共享）/ `exec` / `cp` / `spawn` / `process` / `pool` / `kill`

**收费要点**（【转引】）：按分钟计费，只在 Starting/Running 计费（build 不计）；需正数余额；每月赠送额度 Free $0.10 / PRO $2.00（**额度极小**）；**默认 timeout 30 分钟**，超时自动停并停止计费。

### 5.2 GitHub Actions：官方三件套（【转引】，含两处 404 更正）

| Action | 状态 | 说明 |
|:--|:--|:--|
| **`huggingface/hub-sync@v0.1.0`** | ✅ **现役官方** | 官方示例：`uses: huggingface/hub-sync@v0.1.0` + `github_repo_id / huggingface_repo_id / hf_token`。**注意它"用 `hf` CLI 镜像文件，不是 git-to-git 同步"**，且会自动排除 `.github/`、`.git/`，并镜像删除 |
| `huggingface/upload-to-hub` | ❌ **404 不存在** | 【更正】很多文章还在写它 |
| `huggingface/sync-datasets` | ❌ **不存在** | 【更正】 |
| `huggingface/hf-jobs-action` | 存在（实验性，2★） | 在普通 GitHub runner 里调用远端 HF Job，参数含 `flavor: t4-small`、`image`、`script`，输出 `job_id/job_url` |
| **`huggingface/jobs-actions`** | 存在（Beta，14★） | ⭐ **把 `runs-on` 直接换成 HF GPU**：`runs-on: hf-jobs-a10g-small`。官方 README 逐字："GPU CI for the price of a Hub subscription." 机制：GitHub `workflow_job.queued` webhook → dispatcher 领一次性 runner token → 起一个 HF Job 当临时 runner → 跑完销毁 |
| Trusted Publishers | 官方机制 | 用 GitHub Actions 的 OIDC token 换短时 Hub token，**免存 `HF_TOKEN`** |

**对项目的用法**：如果将来要"在真 GPU 上跑转写基准"，这条比自建 runner 便宜且现成。

### 5.3 官方 MCP Server 与 agent 库（【转引】）

| 组件 | 事实 |
|:--|:--|
| **官方 MCP Server** | 仓库 `huggingface/hf-mcp-server`（294★ / MIT / 2026-09-16）；服务入口 `https://huggingface.co/mcp`；**需要 token**（OAuth 或 `Authorization: Bearer <HF_TOKEN>`） |
| 接入命令（README 逐字） | `claude mcp add hf-mcp-server -t http https://huggingface.co/mcp?login`；`gemini mcp add -t http huggingface https://huggingface.co/mcp?login`；Cursor/VS Code/Zed 等在 https://huggingface.co/settings/mcp 选客户端复制配置 |
| 内置工具 | `hf_fs`（导航 Hub + 文档/Spaces 语义搜索）、Contribute Repos、Sandboxes、Run and Manage Jobs |
| `huggingface_hub.MCPClient` + `Agent`（Tiny Agent） | 官方 Python 内置 MCP 客户端，支持 stdio/http/sse；`pip install "huggingface_hub[mcp]"`；本机实测装出的可执行 **`tiny-agents`** |
| `huggingface/skills` | **11061★ / Apache-2.0** —— Agent Skills 仓 |
| `huggingface/smolagents` | 29350★ / Apache-2.0 —— 官方极简 agent 库 |

### 5.4 第三方"智能体接 HF"这一条线：**很薄，不要押注**（【转引】）

| 名称 | 归属 | Star | 最近推送 | 备注 |
|:--|:--|--:|:--|:--|
| `evalstate/mcp-hfspace` | 个人 | **389** | **2025-06-13** | **第三方 HF MCP 里的最高星，已 15 个月未更新** |
| `shreyaskarnik/huggingface-mcp-server` | 个人 | 72 | 2025-03-19 | 只读 Hub API，约 18 个月未动 |
| `rawveg/ollama-mcp` / `patruff/ollama-mcp-bridge` / `jonigl/mcp-client-for-ollama` | 个人 | 171 / 983 / 823 | 后两个活跃 | 都是"Ollama ↔ MCP"，**不是"HF → 本机"** |
| `langchain-huggingface` / `llama-index-llms-huggingface` | LangChain / LlamaIndex | monorepo 级 | 活跃 | `HuggingFacePipeline`/`HuggingFaceLLM` = **真本地**；`HuggingFaceEndpoint`/`InferenceAPI` = **远端**，别混 |

**没有找到有社区体量的独立"HF 模型下载 MCP"**；最实用的替代是 `signerless/llm-checker` 内置的 MCP（`hw_detect` / `recommend` / `smart_recommend` / `gpu_plan`…），但它许可是 **NPDL-1.0 非 OSI 开源**。

### 5.5 其它官方 CLI 对照：`llama.cpp` 与 `ollama` 的"内置下载"（【转引】）

这两家**都做了 `-hf` 式内置下载**，正好反衬 whisper.cpp 没做：

| 工具 | 语法 | 默认量化选择 |
|:--|:--|:--|
| **llama.cpp** `llama-cli` | `llama cli -hf ggml-org/Qwen3.5-0.8B-GGUF`，可带 `:Q8_0`（**大小写不敏感**） | **先试 `Q4_K_M`，再试 `Q8_0`，都不命中才回退第一个 GGUF**（源 `common/download.cpp::find_best_model()`）。⚠️ 官方 help 未提 `Q8_0` 这层兜底 → **文档与实现有差异** |
| **ollama** | `ollama run hf.co/<user>/<repo>[:quant]` | **默认 `Q4_K_M`**，不在则"挑一个合理的"。⚠️ **Ollama 官方文档已不再记载该语法**，权威文档现在在 HF 一侧；且**Ollama 不做量化**、quant 面窄（历史报错：仅支持 F32/F16/Q4_K_S/Q4_K_M/Q8_0） |

---

## 六、对项目的落地建议（三条具体动作）

| # | 动作 | 依据 | 风险 |
|:--|:--|:--|:--|
| **A1** | **把 `hf` 纳入本机标准工具链**：`uv tool install huggingface-hub` + 固化 `HTTPS_PROXY=http://127.0.0.1:1080`。之后模型检索/下载/校验都用 `hf`，不再手写 `Invoke-WebRequest` | §二、§3.3 实测：一条 `hf models ls <repo> -h --tree` 就能看体积；`--dry-run` 能先算体积 | 低。仅环境变量与一个工具 |
| **A2** | **给智能体装官方技能**：`hf skills add -g --claude`（或项目级）。至少装 `hf-cli` + `hf-mem` + `huggingface-local-models` | §3.3 实测：官方直接发这三个技能，覆盖"会用 CLI / 估显存 / 选本地可跑模型" | 低。可随时 `hf skills update`；不满意可移除 |
| **A3** | **把"能不能在本机跑"从估算改成实测**：① 用 `hf models info <repo> --expand gguf` 或 `?blobs=true` 拿每档体积；② 本机真跑并采样峰值（P13 已有脚本口径）；③ 需要 GPU 档位时用 `hf jobs run --flavor t4-small` 真跑一次 | §4.2 / §4.5 / §4.6：**没有任何工具能替你算 Whisper ggml 的内存**，而 P13 实测已给出 882/932 MiB 的真值 | 中（`hf jobs` 要花钱，$0.40/h 起；额度只有 $0.10） |

**不建议做的**：
- ❌ 不要为"判断能不能跑"引入 `gpu_poor` / `canirun` 这类**无 LICENSE 文件**的项目做生产依赖。
- ❌ 不要押注第三方 HF MCP（最高 389★、15 个月未更新）。
- ❌ 不要指望 `whisper-cli -hf`——**它不存在**（本机复核 + PR #3922 未合并）。要"像 llama.cpp 那样一条命令拉模型"，只能自己做一层封装（我们已有 `scripts/build-whisper-runtime.mjs` 的先例）。

---

## 七、坑与边界

| # | 坑 | 证据 | 规避 |
|:--|:--|:--|:--|
| K1 | **`hf` 不读 Windows 系统代理，默认连不通** | 【实测·本机】直连 49.3 s 超时 → 挂代理 2.7 s 成功 | 先设 `HTTPS_PROXY`/`HTTP_PROXY` |
| K2 | **`whisper.cpp` 没有 `-hf`** | 【实测·本机】help 里 hf 命中 0；【转引】PR #3922 未合并 | 用 `download-ggml-model.sh` 或自家封装 |
| K3 | **`hub-sync` 不是 git 同步** | 【转引】官方逐字"mirrors your files to the Hub using the `hf` CLI — it is not a git-to-git sync"，且**会镜像删除** | 用在 Space/模型仓，别拿它同步代码仓 |
| K4 | **`upload-to-hub` / `sync-datasets` 不存在** | 【转引】404 | 别照抄旧文 |
| K5 | **`hf_transfer` 已废弃** | 【转引】v1.0 起忽略 `HF_HUB_ENABLE_HF_TRANSFER`，改用 `HF_XET_HIGH_PERFORMANCE` | 更新脚本 |
| K6 | **`hf-mirror.com` 的文档还在教废弃写法** | 【转引】仍在用 `huggingface-cli` + `--resume-download`，**在 ≥1.0 下直接失败** | 改 `hf download` + `HF_ENDPOINT` |
| K7 | **HF Jobs 默认 30 分钟超时** | 【转引】超时自动停 | 长任务显式 `--timeout` |
| K8 | **HF 免费额度极小** | 【转引】Free $0.10/月；【实测·本机】价目表 | 别拿它当免费 CI |
| K9 | **社区 VRAM 工具半数没有 LICENSE 文件** | 【转引】`gpu_poor`/`canirun.ai`/`huggingface-estimate`/`CanIRunThisLLM` 均无 | 生产依赖只用 MIT 的（`llmfit`） |
| K10 | **Open LLM Leaderboard 已退役** | 【转引】公告 2025-03-13 逐字"the leaderboard is officially retiring" | 别再用它当现役榜单 |
| K11 | **`general.parameter_count` 这个 GGUF 键不存在** | 【转引】多处源均未见写入 | 参数量靠张量表求和或 `size_label` |

---

## 八、未知清单（核不实的，不删只标）

| # | 未知项 | 说明 |
|:--|:--|:--|
| U1 | 官方 **Hardware compatibility 面板的判定公式** | 设置页需登录，未能核实。只核实了功能存在（官方文档逐字） |
| U2 | `-hf` 首次进入 **llama.cpp 的具体 release tag** | 引入期仍是 `b` 编号 nightly，仓库无 CHANGELOG |
| U3 | **Ollama `hf.co` 的 quant 选择算法 / 架构白名单 / 体积上限** | 官方已不记载该语法 |
| U4 | 本机 `.whisper-research/` 草稿目录的去留 | 10 个文件 / 730 KB，子调研留下，我未删（见 §附录 B） |
| U5 | `hf skills` 各技能的**实际质量** | 只核实了名称与官方描述，未逐个装用评估 |
| U6 | `hf jobs` 在本机**网络条件下的实际可用性** | 未实测跑过 Job（需正数余额） |
| U7 | `hf models ls --format agent` 的**输出格式细节** | 只核实选项存在，未取实际 agent 格式样例 |
| U8 | 第三方 `llmfit` 对 **Whisper/ASR 类模型**的估算准确性 | 它面向 LLM，`hf_models.json` 是否含 whisper 未核实 |

---

## 附录 A：本机实测命令与原始输出

```powershell
# 安装（本机无 python/pip，用 uv）
$env:UV_TOOL_BIN_DIR='D:\_hf_tools\bin'
uv tool install "huggingface-hub[cli]"
# → huggingface-hub==1.31.0；可执行 hf / huggingface-cli / tiny-agents
# → warning: does not have an extra named 'cli'（v1.0 起 extra 已取消）

# 代理（必需）
$env:HTTPS_PROXY='http://127.0.0.1:1080'; $env:HTTP_PROXY='http://127.0.0.1:1080'

# 命令全景
hf --version        # 1.31.0
hf --help           # 22 个顶层命令
hf env              # hf_xet 1.6.0；ENDPOINT=https://huggingface.co；HF_HUB_CACHE=…
hf models --help    # card / info / list(ls)
hf download --help  # --include/--exclude/--local-dir/--dry-run/--max-workers
hf skills --help    # add / list / preview / update
hf jobs --help      # run / logs / wait / cancel / inspect / ls / stats / ssh / scheduled / hardware / uv
hf sandbox --help   # create / exec / cp / spawn / process / pool / kill
hf jobs hardware    # 15 档硬件 + $/分钟 + $/小时

# 找模型 / 判体积 / 列技能
hf models ls --pipeline-tag automatic-speech-recognition --sort downloads --limit 5
hf models ls ggerganov/whisper.cpp -h --tree
hf skills list --no-truncate --format json      # 20 个官方技能
```

**连接性对照（同一时刻）**：

```text
hf models ls --limit 3            → httpx.ConnectTimeout [WinError 10060]，49.3 s
Invoke-WebRequest huggingface.co  → HTTP 200
python socket.create_connection   → TimeoutError
hf models ls --limit 5（挂代理）   → 2.7 s 返回表格
```

**环境事实**：系统代理 `ProxyEnable=0`（关闭）、`ProxyServer=localhost:1080`（已配未启）；`127.0.0.1:1080` 在监听，1087/7890/7897/10809 均未监听。

## 附录 B：工作区清理状态

| 目录 | 状态 |
|:--|:--|
| `.research/` | 已由子调研自行删除 |
| `.research-tmp/` | 已删除 |
| **`.whisper-research/`** | **仍在**：10 个文件 / 730.5 KB（whisper.cpp 的 cli.cpp、common-whisper.cpp、download-ggml-model.sh 等取证材料） |

> 这三个目录都**未入库**（P14 的提交只含 `docs/`）。`.whisper-research/` 是"whisper.cpp 不支持 `-hf`"那一组取证的一手材料，**建议保留**；若不需要，删除即可（不影响任何产物）。

---

**文档版本**：v1.0
**创建时间**：2026-09-17（用户「有没有像 gh 那样的 HF 工具 / 能不能判断本机跑不跑得动 / CI 与智能体接入」需求触发）
**实测环境**：huggingface-hub 1.31.0（uv 装入，Windows x64）｜hf-xet 1.6.0｜PowerShell 7｜本机代理 127.0.0.1:1080
**关联**：`P13-实测基线与最优参数_转写链路.md`（模型体积/内存实测）｜`..\F20260917-转写模型来源调查\00`（模型来源）｜`..\F20260917-转写模型来源调查\01`（本机运行与 GPU）
