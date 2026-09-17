# P16 · 字幕链路「更优模型」调研：HuggingFace 上能做的更好，且能在本机跑

> 触发：用户原话「我们现在处理字幕用的都是一些比较笨的办法。请帮我调查研究一下，在 HuggingFace 上有哪些模型能做得更好，并且支持在本机运行。」
> 范围：**语音转文字 / 字幕结构（断句·时间轴·说话人）/ 字幕文本优化** 三层。
> 用途：**要换引擎、加标点层、改断句策略时先读本文件**（含本机实测数据与不可用清单）。
> 关联：`P13`（现役参数台账）、`P12`（输出格式）、`P14`（HF 工具链）、`P15`（HF 代理接入）。
> 分工：`P13` = 现役链路怎么调优；**`P16` = 换什么、加什么，以及为什么本机 GPU 帮不上忙**。

---

## 一、结论先行

### 1.1 三道问题的答案

| 问题 | 答案 |
|------|------|
| 换 ASR 引擎能更好吗？ | **能**。本机实测：`sherpa-onnx + SenseVoice-small int8` 把中文 267.58 s 音频从 whisper small 的 **93.4 s → 27.5–39.9 s**，且**自带中文标点**（whisper 的中文标点在 `-ml 16` 之外是**零**）。 |
| 现在的「笨」是哪里笨？ | 三条结构性原因：① whisper.cpp **中文不出标点是上游未修复缺陷**（issue #2532，2026-09-06 以 `not_planned` 关闭）；② 断句靠**静音切**而不是语义/词级时间轴；③ 词级时间戳**已经算出来了却被丢掉**（见 §四.4）。 |
| 本机 GPU 能用上吗？ | **不能，且与选型无关**。GTX 750 = CC 5.0：无 fp16、无 Tensor Core、无 DP4A；CUDA 12.8+ 的 PyTorch 已移除 sm50/sm60；CTranslate2 在 CC≤6.0 全回退 float32；ONNX Runtime CUDA EP 从未覆盖 CC 5.0 且 v1.28.0 起连 5.2 也删。**结论：一切按纯 CPU 设计**——而这次推荐的方案本来就只需要 CPU。 |

### 1.2 推荐组合（三层，全部 CPU、无 HF token、无 GPU）

```text
音频 → ① 断句：silero VAD（0.64 MB, MIT）
     → ② 转写：SenseVoice-small int8（228 MB, sherpa-onnx ONNX, 自带标点/ITN/情绪/事件）
     → ③ 标点重做：合并段文本→去句末标点→CT-Transformer int8 一次过（75 MB, Apache-2.0）
     → ④ 文本层：繁简 tw2sp → 术语表 → 语气词/重复 → ITN → 可选纠错
     → ⑤ 回填 VAD/token 时间戳 → 断行 → SRT
```

**最小改动版（零新增依赖）**：保留 whisper.cpp，只加两个参数 `-ml 16` + 既有 `-ojf`，立刻拿到「短句 + 词级时间戳」（本机实测，见 §四.4）。

---

## 二、本机硬约束（决定了谁能进候选）

| 项 | 实测值 | 对选型的含义 |
|----|--------|--------------|
| CPU | i7-9700 8C/8T，AVX2+FMA，**无 AVX-512** | ONNX Runtime CPU 跑得动 0.1–2 亿参数模型；大模型无望 |
| GPU | GTX 750，**CC 5.0**，4096 MiB，驱动 560.94（CUDA 12.6） | **无 fp16 / 无 Tensor Core / 无 bf16 / 无 INT8 DP4A（需 CC≥6.1）** |
| 内存 | 23.79 GiB | 不是瓶颈 |
| 磁盘 | D 盘可用 **48.9 GiB**（比预估的 55 少） | 够，但要删测试残留 |
| Python | 无系统 python/pip，但有 `uv`/`uvx` | 可建 venv；但**产品分发不宜依赖 python** |

**GPU 路线逐条死因**（来源：官方文档/源码/issue，详见 `D:\_p16_research\A-ASR模型调研.md` §6）：

| 路线 | 死因 |
|------|------|
| faster-whisper / CTranslate2 GPU | 官方：int8 需 `CC>=6.1 或 7.0`、fp16 需 `CC>=7.0`；**CC≤6.0 所有 compute type 回退 float32** |
| ONNX Runtime CUDA EP | 历史最低档 `52-real`，**CC 5.0 从未被覆盖**；v1.28.0 起连 5.2 也移除 |
| whisper.cpp CUDA 13.x | 资产 arm64-only + 需驱动 ≥580（本机 560.94）+ CUDA 13 已移除 Maxwell |
| PyTorch CUDA 12.8+（WhisperX） | sm50/sm60 被移除（最低 CC 7.0） |
| OpenCL | 实测为 Adreno 专用，显式拒绝 NVIDIA |

> 即：**现在能跑的 whisper.cpp CUDA 12.4 是 Maxwell 上唯一的 GPU 路径**，且实测「GPU 只在 turbo 级模型上值得」（`P13`：small 1.2×、turbo 2.2×）——换到 SenseVoice 后这条路连必要性都没有了。

---

## 三、本机实测：四个引擎、同一段中文音频

**素材**：`D:\_whisper_gpu_test\bench_zh_16k.wav`（267.578 s，16 kHz 单声道，TTS 合成中文，含「护城河 / 路线图 / 灰度测试 / 视频素材」等易错词，内容重复 5 遍）。
**错例统计口径**：预置 12 个错词形（护程/故城河/护城盒/后缅/比较具/断剧/排板/入屏/归测试/恢复度/使用用/不不成合）的出现次数之和——**该口径偏向 whisper（错词形是从 whisper 输出里观察到的）**，但足以横比。

| 引擎 | cues | 正文汉字 | 标点总数 | 。 | ， | 、 | 错例数 | 错例明细 |
|------|------|---------|---------|----|----|----|-------|---------|
| **SenseVoice-small int8 + VAD** | 100 | 944 | 100 | 95 | 0 | 0 | **0** | — |
| Dolphin-base int8 + VAD | 100 | 947 | 67 | 67 | 0 | 0 | 19 | 故城河×2 断剧×5 排板×4 入屏×1 归测试×3 恢复度×1 使用用×2 不不成合×1 |
| whisper small（CPU `-t8`） | 36 | 974 | 42 | 24 | 0 | 18 | 15 | 护程×4 后缅×4 比较具×7 |
| whisper small + `--vad` | 56 | 945 | 54 | 22 | 0 | 32 | 2 | 护程×1 后缅×1 |
| whisper turbo-q5_0（CPU `-t8`） | 96 | 945 | **0** | 0 | 0 | 0 | 0 | — |
| whisper turbo-q5_0（GPU） | 82 | 945 | 15 | 0 | 0 | 15 | 5 | 护城盒×5 |

**耗时（同一素材 267.58 s）**：

| 引擎/配置 | 耗时 | RTF | 备注 |
|-----------|------|-----|------|
| SenseVoice int8 + VAD，`-t8` | **27.5 s / 39.9 s**（两次） | 0.103 / 0.149 | + VAD 2.9 s + 加载 5.6–7.2 s |
| SenseVoice int8 + VAD，`-t4` | 32.7 s | 0.122 | 线程数在噪声内 |
| SenseVoice fp32 + VAD，`-t8` | 42.9 s / 50.3 s | 0.160 / 0.188 | 精度相同、慢约 1.3× |
| SenseVoice int8 **不分段**（整段喂） | **123.1 s** | 0.460 | **VAD 是必需项**，不是优化项 |
| Dolphin int8 + VAD，`-t8` | **16.0 s** | 0.060 | 最快，但错例 19 |
| whisper small（CPU `-t8`，P13 基线） | 84.5 / 93.4 s | ≈0.33 | 本轮同窗口复跑得 312 s（见下） |
| whisper small + `--vad`（P13） | 83.8 s | ≈0.31 | — |
| whisper turbo-q5_0（CPU / GPU，P13） | 208.7–223.6 s / 100.2 s | — / ≈0.37 | GPU 需 12.4 CUDA 运行库 |

**SenseVoice 等价英文**：`bench16k.wav`（206.41 s）→ VAD 40 段、ASR 31.3 s（RTF 0.152），输出为正常英文（无中文标点混入）。

> ⚠️ **计时方差**：本轮 whisper.cpp baseline 在同一配置下复跑得 **312 s**，而 P13 同期为 84.5/93.4 s（跨度 3.7×）。**CPU 绝对秒数只能当量级用**；上表两列都必须连同这一点读。

### 3.1 关键发现：SenseVoice 的标点「够用但笨」

SenseVoice **原生自带标点**（不是后处理加的，`RAW` 就带 `。`），但它**每段只给一个句末标记**，因此：

- 好：`。` 95 个、`？` 5 个，**与 VAD 段一一对应**，不再出现 whisper 那种「整段零标点」；
- 差：段内**没有逗号/顿号**，导致「护城河。路线图。灰度测试。视频素材。」这种碎句。

**修法（本机实测三种标点策略）**：

| 做法 | 输出标点分布 | 用时 | 评价 |
|------|--------------|------|------|
| A：段内自带（现状） | `。`95 `，`0 `、`0 | 0 | 碎，但不错 |
| **B：合并所有段文本 → 去句末标点 → CT-Transformer 一次过** | **`。`29 `，`48 `、`11** | **0.27 s** | ✅ **推荐**，分布最自然 |
| C：逐段过 CT-Transformer | `。`95 `，`10 `、`0 | 0.57 s | ❌ 过度加标点（与 sherpa 文档自述一致） |

⇒ **顺序不能反**：先用 SenseVoice 拿到准字，**再合并重标点**；逐段加标点等于把碎句固化。

---

## 四、三层候选清单（含本机判定）

### 4.1 ASR 层

| 候选 | 体积（实测字节） | 许可证 | 本机路径 | 判定 |
|------|------------------|--------|----------|------|
| **SenseVoice-small int8** | ONNX **228.2 MB**（fp32 894.2 MB） | ⚠️ `license:other` → FunASR **MODEL_LICENSE v1.1**（**须署名 + 保留模型名**，"for reference and learning"） | sherpa-onnx ONNX / CPU | ✅ **精度+标点+速度综合最优**（许可证是唯一风险） |
| **Dolphin-base CTC int8** | 打包 80,671,385 B（76.9 MB）/ 解包 98.9 MB | ✅ **apache-2.0** | 同上 | ✅ **许可最干净、最快（RTF 0.060）**，但本机实测错例 19，精度不足 |
| whisper.cpp + `-ml 16` | 0（现役 574 MB 模型不变） | MIT | 现役 | ✅ **零成本拿到短句+词级时间戳**；带来孤儿行 |
| whisper.cpp + 中文标点模型 | 打包 64,717,756 B（61.7 MB）/ 解包 72 MB | Apache-2.0（源自 ModelScope） | 独立第二遍 | ⚠️ 能补标点但**准确率不透明**（ct-punc 官方 P53.8/R60.0/F1 **56.5**，且 sherpa 自述**过度加标点**） |
| Paraformer-zh int8 | 228.3 MB | apache-2.0 | sherpa-onnx | ✅ 可跑（AISHELL-1 **1.95**，但**不原生出标点**） |
| FireRedASR-AED-L | 4.68 GB | apache-2.0 | sherpa-onnx | ⚠️ **中文最准（0.55）但本机 CPU RTF 1.945（比实时慢）** |
| Moonshine base-zh int8 | 95.3 MB | ✅ `mit` | sherpa-onnx | ⚠️ Fleurs-zh 16.1，弱 |
| Zipformer zh int8 | 50.5–62.0 MB | apache-2.0 | sherpa-onnx | ⚠️ ws_net 7.65，部分 `-punct` 变体 |
| TeleSpeech int8 | 183.2 MB | ⚠️ **cardData 写 apache-2.0，实际商用需向中电信申请授权** | sherpa-onnx | ⚠️ 许可证陷阱 |
| Qwen3-ASR-0.6B / FireRedASR 之外的 Audio-LLM（Qwen2-Audio-7B、Step-Audio、GLM-4-Voice） | 8–17 GB | — | — | ❌ 远超 4 GiB 显存 |

**精度参照（转引，来自 A 报告 §5.10）**：FireRedASR2-AED 0.57 / FireRedASR-AED-L 0.55 / Qwen3-ASR-1.7B 1.48 / Paraformer-large 1.95 / **SenseVoice-Small 2.96** / Whisper-large-v3 **5.14**（AISHELL-1 CER）。
⚠️ **SenseVoice 不是精度冠军**——它赢的是「精度 × 标点 × 速度 × 体积」的交集；**换引擎前必须拿用户自己的口播音频做 A/B**。

### 4.2 字幕结构层（断句 / 时间轴 / 说话人）

| 能力 | 推荐 | 体积 | 许可证 | 本机实测 |
|------|------|------|--------|----------|
| VAD 切段 | silero_vad.onnx（sherpa）/ ggml-silero（whisper.cpp） | 0.64 MB / 0.885 MB | MIT | ✅ 96.6 s 音频 → 100 段，2.7–3.8 s |
| 说话人分离 | sherpa-onnx + pyannote-segmentation-3.0(ONNX) + 3dspeaker CAM++ zh-cn | 5.99 MB + 28.28 MB | **MIT + Apache-2.0** | ✅ **56.861 s → 8.0 s（RTF 0.141），4 人全对**（单线程 CPU） |
| 词级时间轴 | whisper.cpp token timestamps（`-ml` / `-ojf` 已触发） | 0 | MIT | ✅ 见 §4.4 |
| 断句/行宽算法 | **没有成熟模型可换**，业界就是规则 | — | — | Netflix 官方规范：简中 **16 字/行**、成人 ≤**9 字符/秒**（儿童 7）、最多 2 行、下宽上窄、**简中不用逗号句号而用一个空格** |

**被挡在门外的**：WhisperX（中文对齐模型 `jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn` = **1.28 GB**，且要 torch + cu128）、whisper-timestamped（**AGPL-3.0**）、ctc-forced-aligner（默认模型 **CC-BY-NC 4.0**）、pyannote 官方 diarization（**gated，需 HF token + 网页接受条款**；同样权重有 MIT 非 gated 镜像）、MFA（Kaldi/conda 工具链重）、所有 >400 MB 的标点/分句模型、`suko/subtitle-linebreak-bilingual`（尺寸合格但作者自报 F1 仅 0.53/0.77）。

> 一句话：**别指望「让模型来断句」**；正确做法是 VAD + 词级时间戳 + 规则（CPS / 单行字数 / 禁断词表），而 Netflix 那套数值给了规则一个官方依据。

### 4.3 字幕文本层（字面质量）

| 层 | 推荐 | 体积 | 许可证 | 本机实测 |
|----|------|------|--------|----------|
| 繁简 | **OpenCC 1.4.2，必须用 `tw2sp`** | 2.76 MB | Apache-2.0 | ✅ 15.6M chars/s；`t2s` 会把「軟體/滑鼠/游標」转成「软体/滑鼠/游标」这类**简体语境里的错词** |
| ITN 逆文本归一化 | **wetext 0.1.8**（WeTextProcessing） | wheel 4.84 MB / 装后 43.9 MB | Apache-2.0 | ✅ Windows 实测跑通：`一千二百三十四元五角 → ¥1234.5`、469 chars/s |
| 语气词/重复 | 正则 | 0 | — | ✅ 确定性、无依赖 |
| 术语表/热词 | pyahocorasick 别名映射 | 0 | — | ✅ 确定性替换（比让 LLM 自由发挥可控） |
| 错字纠错 | `shibing624/macbert4csc-base-chinese`（**仓内自带 ONNX**，免 torch） | 452.4 MB | Apache-2.0 | ⚠️ 未实测（超 100 MB 约定）；**标点模型不纠错字**（实测「护程/后缅」原样保留） |
| 可选 LLM 润色 | Qwen3-1.7B Q4_K_M（llama.cpp **CUDA 12.4** 版） | 1056 MB | Apache-2.0 | ⚠️ **推算** 11–18 tok/s；Qwen3-4B 会逼近 15 分钟红线；Qwen3-8B/GLM-4-9B **放不下 4 GiB** |

### 4.4 一个「零依赖」发现：词级时间戳早就在手里

**源码级证据**（`whisper.cpp` v1.9.2 `examples/cli/cli.cpp`）：

```cpp
wparams.token_timestamps = params.output_wts || params.output_jsn_full || params.max_len > 0;
```

即 **`-ojf`（我们已经在用）和 `-ml N` 都会打开 token 时间戳**。

**本机实测 `-ml 16`（whisper small，同一素材）**：

| 配置 | cues | 最长行 | >16 字的行 | 正文 |
|------|------|--------|-----------|------|
| baseline `-t8` | 36 | **38 字** | 31 行 | 1068 字 |
| `-ml 16` | **89** | **16 字** | **0 行** | **1068 字（逐字不变，0 个 U+FFFD）** |
| `-ml 20 -sow` | 36 | 38 字 | 31 行 | 1068 字（对中文无效：无空格可切） |

⇒ **一个参数把「一屏字数失控」修掉，且文本零改动**。代价是会产生**孤儿行**（实测第 3 条只剩「字幕。」，停留 0.38 s）——所以 `-ml` 必须与「最短停留/禁断词」规则配套，不能裸用。

---

## 五、对 Recordly 转写链路的具体建议（不改代码，只记结论）

现状：`generate.ts` 传 `-m -f -osrt -of -l -np -ojf`，**已开 `-ojf`**；`parser.ts` 只保留段级 `text/offset`。

1. **`-ojf` 的 token 时间戳已经被算出来，但被丢掉了**（`parser.ts` 未读词级数组；P12 已证明 v1.9.2 的中文词级 token 0 损坏）。→ 「逐字字幕 / 卡拉OK / 更细断句」的**数据早就有**，缺的是消费。
2. **`-t 8`**（默认 4，本机 8 线程）、**`--vad -vm <silero>`**、**`-ml 16`** 是三个零/低成本参数（依据 `P13` + 本文 §4.4）。
3. **口播录屏默认转的是混音轨**（`generate.ts:119` 先 push 录制本体），与本目标不匹配——见 `P13` 硬结论 6。
4. 若要**换引擎**（SenseVoice）：收益是「中文标点从 0 到有 + 快 2–3× + 免 GPU」，代价是**新增一个运行时与模型**（exe 23 MB 级 + 模型 228 MB）与**一份新许可证**（FunASR MODEL_LICENSE，须署名）——属于产品决策，不在本报告擅自拍板。

---

## 六、诚实的边界（本报告没证明的）

| # | 未证明的事 |
|---|------------|
| 1 | **没有 ground-truth 转写稿**，所以「错例 0/19/15」是**预置错词形的计数**，不是 WER。真实口播（非 TTS）上的错例率仍未知 |
| 2 | 测试素材是 **TTS 合成音**、内容重复 5 遍；真实录屏有口音、环境噪声、口语顺口 |
| 3 | SenseVoice 的许可证是 **FunASR MODEL_LICENSE v1.1**（我实测抓取全文）：可自由使用/修改/分享，但**须署名并保留模型名**，且文本写明「for reference and learning」——**商用边界需用户判断** |
| 4 | Dolphin 的**中文主榜空白**（只有 Fleurs-zh 6.5），本机实测又不如 SenseVoice → 其价值在许可证与速度，不在精度 |
| 5 | 所有 LLM 的 tok/s 都是**推算**（带宽 × 量化位数 × 效率），**本机没跑过任何 GGUF 基准** |
| 6 | `-ml 16` 的耗时变化**不可判定**（同窗口 baseline 312 s vs `-ml` 118.5 s，但本机方差本身就有 3.7×） |
| 7 | Netflix 的中文数值来自其官方规范页（转引），**未逐条复核原始 PDF** |

---

## 七、证据与素材位置

| 内容 | 位置 |
|------|------|
| 我方实测脚本（SenseVoice/Dolphin/标点分层/对比表） | `D:\_sherpa_test\run_sensevoice.py`、`run_dolphin.py`、`punct_layers.py`、`final_compare.py`、`bench.ps1` |
| 实测产出（SRT/TXT/JSON/stdout） | `D:\_sherpa_test\out\`（A2/G/M_* 等） |
| 三个子调研全文（含命令原文与原始输出） | `D:\_p16_research\A-ASR模型调研.md`、`B-字幕结构层调研.md`、`C-字幕文本质量层调研.md` |
| 模型与运行时落点 | `D:\_sherpa_test\models\`（sensevoice / dolphin / punct / vad）；exe：`D:\_sherpa_test\sherpa-onnx-v1.13.8-win-x64-static-MT-Release\bin\` |
| 现役链路基线 | `P13`；输出格式 `P12`；HF 连接 `P15` |
