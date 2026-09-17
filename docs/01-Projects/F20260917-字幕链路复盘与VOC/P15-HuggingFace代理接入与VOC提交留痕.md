# P15 · HuggingFace 代理接入与 VOC 提交留痕

> 触发：用户要求「把 HuggingFace 智能体如何启动 CLI、需要连接代理这些内容，全部更新到 proxy-manager 里作为 VOC 提交」。
> 用途：**将来在本机用智能体连 HuggingFace 时，照抄本文件即可；要构建 HF 技能时，先读本文件 + `P14`。**

---

## 一、这一轮做了什么（结论先行）

| # | 事项 | 落点 | 状态 |
|---|------|------|------|
| 1 | HF CLI 代理实测（10 项）与根因定性 | 本文件 §二 | ✅ 【实测·本机】 |
| 2 | VOC 需求清单（HF1～HF7 + 完成标准 + 非目标 + 待确认） | `D:\code\proxy-manager\docs\01-Projects\R20260917-01-HuggingFace代理自动接入\AI02-01-A_需求清单_HuggingFace代理自动接入.md` | ✅ 已提交 |
| 3 | 方案评估（装 HF CLI + 新增「CLI+Skill」技能是否合适、怎么配合） | 同夹 `01-调查_安装HF-CLI与新增CLI+Skill技能的方案评估.md` | ✅ 已提交 |
| 4 | R01 产品账本登记 | proxy-manager `…\R20260813-01-产品管理和演进\16-需求_HuggingFace代理自动接入.md` + `00-README.md` | ✅ 已登记 |
| 5 | 实施 | proxy-manager 本仓（阶段 1：CLI 代理剖面） | ⏸ **用户稍后自行更新**（本轮按 VOC 流程不改产品代码） |

**一句话结论**：`hf` 连不上**不是网络问题，是没人给进程注入代理环境变量**；实测无变量 **43.2 s 超时**、有变量 **2.2 s 成功**。

---

## 二、实测认知：为什么 HuggingFace「连不上」

环境：2026-09-17 本机；Shadowsocks 隧道在 `127.0.0.1:1080`（PID 13044，实测 HTTP CONNECT 与 SOCKS5 都通）。

| # | 实测项 | 结果 |
|---|--------|------|
| 1 | 直连 `https://huggingface.co/api/…`（curl） | ❌ `code=000`，12 s 超时（**本机直连 HF 不通**） |
| 2 | 隧道 `-x http://127.0.0.1:1080` | ✅ 200 / 2.55 s |
| 3 | 隧道 `-x socks5h://127.0.0.1:1080` | ✅ 200 / 1.04 s |
| 4 | `hf` **无**代理变量 | ❌ `httpx.ConnectTimeout`，**43.2 s** |
| 5 | `hf` + `HTTPS_PROXY`/`HTTP_PROXY=http://127.0.0.1:1080` | ✅ 成功 / **2.2 s** |
| 6 | `hf` + 仅 `ALL_PROXY=http://127.0.0.1:1080` | ✅ 成功 / **2.1 s** |
| 7 | `hf` + `HTTPS_PROXY=socks5h://…` | ❌ `ImportError: … the 'socksio' package is not installed` |
| 8 | `hf download` **无**代理变量 | ❌ `WinError 10060`，43.3 s |
| 9 | 镜像免代理 `https://hf-mirror.com/api/…` | ✅ 200 / **0.60 s** |
| 10 | `hf` + `HF_ENDPOINT=https://hf-mirror.com`（无代理） | ✅ 成功 / **2.0 s** |

**三条可直接行动的结论**：

1. **根因是环境变量，不是网络**：`hf`（huggingface_hub 1.31.0）走 Python `httpx`，**不读 Windows 系统代理**（本机 `ProxyEnable=0`），只看 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`。
2. **必须用 `http://` 形式**：隧道本身支持 SOCKS5，但 `hf` 用 `socks5://` **必失败**（缺 `socksio` 依赖）。
3. **有一条免代理兜底**：`HF_ENDPOINT=https://hf-mirror.com` 直连可用（只读/下载），代理彻底断了也能救急。

**第二类「连不上」（易被误判成网络问题）**：

- `hf.exe` 在 `D:\_hf_tools\bin\`（uv tool 自定义 bin 目录），**不在 PATH**；【实测】`Get-Command hf` 为空。
- `proxy-manager.exe` 在 `…\Python312\Scripts\`，**本会话 shell 里不是可识别命令**。
- 用户级 PATH 含这些目录，但**智能体进程继承到的 PATH 不含** → 智能体必须用**绝对路径**，别假设 PATH。

---

## 三、可直接照抄的 HF 用法（PowerShell）

```powershell
# ① 代理（每个新 shell 都要设；这一步是 43 s 失败 vs 2 s 成功的分水岭）
$env:HTTPS_PROXY = 'http://127.0.0.1:1080'
$env:HTTP_PROXY  = 'http://127.0.0.1:1080'
# 可选：快失败，避免一次失败干等 43 s
$env:HF_HUB_ETAG_TIMEOUT = '10'

# ② CLI 不在 PATH，用绝对路径（本机现状）
$hf = 'D:\_hf_tools\bin\hf.exe'

# ③ 查模型（智能体友好：单行 JSON）
& $hf models info ggerganov/whisper.cpp --format agent

# ④ 拉单个模型文件【实测 3 s 通过】
& $hf download ggerganov/whisper.cpp ggml-large-v3-turbo-q5_0.bin `
    --local-dir D:\_whisper_gpu_test\models
```

**兜底（代理不通时）**：

```powershell
$env:HF_ENDPOINT = 'https://hf-mirror.com'   # 免代理可用；只读/下载，上传与部分 API 不可用
```

---

## 四、VOC 提交内容摘要（给 proxy-manager）

核心诉求（用户原话）：**使用 HuggingFace CLI 时能自动启动代理并准确连上，「绝对不允许出现连不上的情况」**。

提出的能力（HF1～HF7，详见需求清单）：

| 编号 | 一句话 |
|------|--------|
| HF1 | 一句话自动接通：探端口 → 按需拉起隧道 → 注入环境 → 验证 → 放行（沿用 owned 恢复现场） |
| HF2 | 注入 `http://127.0.0.1:<实际端口>`（禁 `socks5://`），端口不硬编码 |
| HF3 | 零失败：端口闸 + ≤3 s 出网闸 + 快失败参数 + 镜像兜底 + 中文三步自救（**不允许 traceback / 43 s 静默**） |
| HF4 | 工具可达性前置检查（命令找不到时别说成网络错误） |
| HF5 | 三通道同批：`env cli` / `ensure cli` / `run --with-proxy --` + Skill + API |
| HF6 | 场景与 Skill 发现入口双写（建议新增 S17 / S18） |
| HF7 | 通用能力，**不止 HF**（pip / uv / 其它 CLI 复用同一剖面） |

**先例**：`download-files-master` 已经跑通同一形状（内嵌 `proxy_manager` 轮子 + `[NEED_INSTALL tool=proxy-manager]` + owned 生命周期），本次沿用不新造。

**顺带发现的跨技能不一致**：`download-files-master` D03 记的默认端口是 **1087**，本机实际 **1080** → 建议统一以「实际监听端口」为准。

---

## 五、方案评估结论（问题 2 的答案）

| 问题 | 结论 |
|------|------|
| 装 HuggingFace CLI？ | ✅ 合适，**本机已装**（`huggingface-hub 1.31.0`，uv tool；命令 `hf` / `huggingface-cli` / `tiny-agents`），官方唯一入口，无替代品 |
| 新增「CLI + Skill」智能体技能？ | ✅ 合适，但**必须独立成仓**，不要塞进 proxy-manager |
| 怎么配合？ | **proxy-manager 负责「让任何 CLI 有网」，HF 技能负责「让 hf 好用」**；依赖单向 HF 技能 → proxy-manager |

**否决的两个方案**：塞进 proxy-manager（职责膨胀，HF 业务与代理生命周期无关）；只装 CLI 不建技能（每次手拼变量，忘一次就是 43 s 超时，与「绝对不允许连不上」直接冲突）。

---

## 六、与转写链路的关系（将来构建/更新项目时怎么用）

- 转写模型（`ggml-*.bin`）就在 HF **`ggerganov/whisper.cpp`** 仓库里，`hf download` 可直接拉，**前提是 §三 的代理变量**。
- 本机选择的 `ggml-large-v3-turbo-q5_0.bin`（574,041,195 B，sha256 `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`）与运行参数据 **`P13`**；模型来源与 33 个文件尺寸/校验见 `F20260917-转写模型来源调查/00-调查报告_*.md`。
- **顺序**：`P15`（先把网接通）→ `P13`（照抄参数与基线）→ `P12`（决定产物格式）。

---

## 七、未解决 / 待办

| # | 待办 | 归属 |
|---|------|------|
| 1 | proxy-manager 阶段 1 实施（CLI 代理剖面 + 场景双写） | 用户稍后自行更新 |
| 2 | HF 技能独立仓（CLI+Skill 骨架照抄 proxy-manager 技术规范） | 待方案确认 |
| 3 | `hf` 加入 PATH（或技能内固定绝对路径） | 待定 |
| 4 | 回写 `download-files-master` D03 的端口口径（1087 → 实际监听） | 待定 |
| 5 | `socksio` 是否安装（当前不装，用 `http://` 已够） | 暂缓 |
