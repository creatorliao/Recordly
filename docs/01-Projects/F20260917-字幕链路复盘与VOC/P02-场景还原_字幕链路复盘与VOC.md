# P02-场景还原_字幕链路复盘与VOC

## 一、背景概述

- **背景**：用户要对短视频 MP4 做「识别字幕 → 优化字幕 → 烧录字幕」三步处理，目标成片「内容合理准确、效果美观合理」。
- **目的**：把一条 53.3MB / 720×1280 / 314.047s 竖屏口播片处理成带硬字幕的成片；并额外要求用**全部 5 个内置模板**各出一版以对比真实效果。
- **结果**：
  - 交付 5 个模板成片，**每个均通过 8/8 成片校验**；
  - 优化字幕 163 条，**时间轴零改动**（四项硬门全绿）；
  - 生成 1 张总览对比图 + 4 张单场景对比图；
  - 用户确认「过程探索步骤过多」，并要求把硬字幕/台标处理沉淀为实践。
- **价值判断**：用户判断**整体做得好但过程不经济**；其中「识别硬字幕 + 处理硬字幕与 logo」被评为**超出预期**（用户原话：这些细节是我原来没有想到的）。

---

## 二、过程还原

### 2.0 起点与信息缺口

#### 具体做法
用户只给了意图，未给文件路径。工作目录 `D:\code\Recordly` 内**无待处理视频**（唯一命中是 `public\wallpapers\wispysky.mp4`，3.4MB，属项目资源）。

于是执行了全机扫描，命中候选：

| 候选 | 大小 | 位置 |
|:---|:---|:---|
| 红杉 AI 行业报告详解…（最终选用） | 53.3MB | `Desktop\新建文件夹\` |
| AI落地避坑全指南（上） | 191.9MB | `Desktop\新建文件夹\` |
| 让AI引经据典.mp4 | 440.6MB | `Videos\R20260916-…\03-Resources\原始输入\` |
| 其他 12 条录屏 | 8.8–164.3MB | `Desktop\Workbuddy\…\recordings\` |

同时用三问向用户确认了：**目标文件 / 「ROO 水印」具体指什么 / 模板样式**。

#### 关键参数/设置
```powershell
Get-ChildItem -Path . -Recurse -Include *.mp4,*.MP4 -File
# 扫描范围（含超时保护）：Desktop / Downloads / Videos / D:\code
$env:PATH += ";$env:USERPROFILE\.local\bin"   # 关键：CLI 落点不在默认 PATH
```

#### 环境就绪探测（一次性）
```powershell
foreach($c in @('subgen','subtitle-optimize','subtitle-burn','ffmpeg','uv')){
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  if($cmd){ "[OK]   $c  $($cmd.Source)" } else { "[MISS] $c" }
}
```
结果：`subgen` / `subtitle-optimize` / `subtitle-burn` **全部就绪**于 `C:\Users\creator\.local\bin`，ffmpeg 位于 `AppData\Local\agents\tools\ffmpeg\9.0.1-essentials_build\bin`。→ **本次全程零安装、零懒装重试。**

#### 源片规格探测
```powershell
ffprobe -v error -show_entries format=duration,size,bit_rate `
  -show_entries stream=index,codec_type,codec_name,width,height `
  -of default=noprint_wrappers=1 "<源片>"
```
实测：`duration=314.047067`、`size=55838765`、`bit_rate=1422430`、`720x1280`、`aac`+`h264`、**无字幕流**。

> ⚠️ **这是本次第一个、也是最贵的一个缺失**：探测时只看了规格，**没有同时做「源片是否自带硬字幕 / 有无台标」的前置检查**。该检查直到烧录前才做，导致后面 5 轮返工。

---

### 2.1 阶段一 · 识别字幕（ASR）

#### 具体做法
```powershell
subgen transcribe "<源片>" `
  --language zh --simplify auto `
  --out-dir "<工作区>" --format srt,txt --json
```

#### 关键参数/设置

| 参数 | 值 | 说明 |
|:---|:---|:---|
| `--language` | `zh` | 锁中文，避免 auto 误判 |
| `--simplify` | `auto` | 繁→简字形归一（实测 0 字需转换） |
| `--format` | `srt,txt` | 双格式 |
| `--out-dir` | 独立工作区 | **不覆盖原片目录** |
| 模型 | `large-v3-turbo-q5_0`（默认档，574MB，已装） | 未再下载 |

#### 实测结果
- **163 条**字幕，`elapsedSec=0.56`（**命中缓存**），`cueCount=163`
- 若**未命中缓存**，预计 **17分36秒**（RTF 3.363，1 次实测中位）
- 语速 342.6 字/分（`speechRate=fast`），平均 11 字/条，最短 660ms / 最长 4280ms

> 💡 **缓存是本次最大的省钱/省时红利**：同一素材重跑从 ~17.5 分钟降到 0.56 秒。

---

### 2.2 阶段二 · 优化字幕（文字纠错）

#### 具体做法
分三步：体检 → 复制基线 → 定点纠错 → 硬校验。

**第 1 步 · 体检（含竖屏上下文）**
```powershell
subgen check "<srt>" --media "<源片>"
```
结果：**0 错误 / 19 提示**；`line_too_wide` ×13、`duration_too_short` ×6；语速 342.5 字/分（偏快）。
CLI 明确提示：这些多为语速导致，**不是转写缺陷**。

**第 2 步 · 建基线副本（为了能证明时间轴未动）**
```powershell
Copy-Item "<原始转写.srt>" "<工作区>\红杉_baseline.srt"
```

**第 3 步 · 定点纠错**
`subtitle-optimize repair` 只做语气词/文字病灶/标点/跨条推断，**不做专有名词纠错**，故本次 10 处误识由 Agent 按判据表逐条替换，并要求**每处命中数必须为 1**（不唯一则不改）：

```powershell
$edits = @(
  @{ from='不同的互乘合';     to='不同的护城河';     why='ASR 误识：护城河（moat）' },
  @{ from='会在哪里看住';     to='会在哪里卡住';     why='ASR 误识：卡住' },
  @{ from='自动写Brace';      to='自动写brief';      why='ASR 误识：brief' },
  @{ from='自动生成Bero素材'; to='自动生成视频素材'; why='ASR 误识：疑为 video' },
  @{ from='太容易被料化';     to='太容易被量化';     why='ASR 误识：量化' },
  @{ from='行业的knowhow';    to='行业的know-how';   why='英文连字符规范' },
  @{ from='用灰度AV测试';     to='用灰度AB测试';     why='ASR 误识：AB 测试' },
  @{ from='自己的roll map';   to='自己的roadmap';    why='ASR 误识：roadmap' },
  @{ from='一层操线上跳很难'; to='一层一层往上跳很难'; why='ASR 误识叠字' },
  @{ from='但虽然用AI帮你压到'; to='但是用AI帮你压到'; why='口误赘余' }
)
# 逐条校验命中数，==1 才替换；全部唯一（唯一性随后由 verify 复核）
```

**第 4 步 · 时间轴硬校验（本阶段的验收核心）**
```powershell
subtitle-optimize verify "<baseline.srt>" "<optimized.srt>" --json
```

#### 迭代与调整（本阶段有 1 次真实返工）

| 轮次 | 结果 | 原因 |
|:---|:---|:---|
| 第 1 次 | ❌ `status: red`，硬门 3/4 | **`encoding` 失败：BOM 丢失** —— 我用 `UTF8Encoding($false)` 写盘，把 `subgen` 特意加的 BOM 去掉了 |
| 修复 | 补回 `EF BB BF` | `[System.IO.File]::WriteAllBytes($out, ($bom + $body))` |
| 第 2 次 | ✅ `status: green`，**四项硬门全绿** | `只改文字，未动时间线` |

最终校验证据：
```text
cue_count        163 → 163              ✅
timecodes        163 条起止时间码逐条完全一致 ✅   (timecodeDiffs 为空)
index_sequence   完全一致                ✅
encoding         utf-8 / bom=true / LF   ✅
line_count       651 → 651 (软项)         ✅
textChangedCueCount = 10   （与编辑数吻合）
textChangedCues = [8,11,17,18,20,24,69,148,152,153]
```

> ⚠️ **一处跨条替换踩坑**：`用灰度AV测试` 命中 0 次——因为「用灰度」与「AV测试」**分属前后两条字幕**，中间隔着序号行与时间码行。改为只替换 `AV测试` 后命中 1 次。

---

### 2.3 阶段三 · 源片洁净度检查（**本次最关键、也最晚才做的一步**）

#### 具体做法
```powershell
subtitle-burn check-source "<源片>" --json
```

#### 实测结果
```json
{
  "existing_subtitles": true,
  "confidence": "high",
  "method": "row-gradient-spike-relative-to-frame-median",
  "bands": [
    {"y0_ratio":0.035,"y1_ratio":0.044,"strength":3.06},
    {"y0_ratio":0.765,"y1_ratio":0.794,"strength":13.01},
    {"y0_ratio":0.808,"y1_ratio":0.844,"strength":12.33}
  ],
  "summary": "疑似源片自带硬字幕（high 置信，画面下半部检出 3 条高对比带）",
  "next_step": "consider_clean_source"
}
```

#### 抽帧目视确认（**必须做，detector 只给"疑似"**）
```powershell
ffmpeg -v error -ss 30 -i "<源片>" -frames:v 1 -y "probe_t30.jpg"
```

目视确认了两件 detector 没说清的事：

1. **源片底部已烧死中英双语硬字幕**（中文 + 英文两行），位置约在画面 76%–84% 高度。
2. **右上角有 B 站台标** `Penny破圈观察 bilibili` —— 这才是用户口中的「ROO 水印」。**它在画面里，不在字幕文字里**。

> 🔴 **由此推翻了用户的初始假设**：用户原以为「ROO 是识别出来的错字，只在字幕文字里」，选择了「不动画面」的处理方式。实测证明 **画面必须处理**，否则新字幕会与旧字幕叠成两层（ffmpeg 不会报错，只有肉眼能发现）。

#### 向用户发起的决策（3 问）

| 问题 | 用户选择 |
|:---|:---|
| 旧字幕怎么办 | **不裁切，用模糊遮住旧字幕** |
| 「ROO 水印」是什么 | **是台标，帮我盖掉** |
| 新字幕语言 | **只要中文** |

---

### 2.4 阶段四 · 硬字幕与台标精确测量（**5 轮返工所在**）

#### 测量方法演进

| 方法 | 做法 | 结果 |
|:---|:---|:---|
| ① detector 比率 | `check-source` 的 `y0_ratio` 换算 → y=955..993 / 980..1053 | **不准**：两行字幕被当成两条独立带 |
| ② 抽帧目视 | `ffmpeg -ss t -frames:v 1` + 9 宫格裁剪放大 | **两次量偏**（见下） |
| ③ 全片梯度扫描（最终） | `fps=2` 全片抽帧 → `numpy` 逐行算**纵向梯度** → 阈值 `>60` 且该行强梯度像素 `>90` | ✅ **收敛**：y=976..1086，p1=976 |

#### 方法③ 的脚本（可复用）
```python
import subprocess, numpy as np
src = r"<源片>"
W, H = 720, 1280
p = subprocess.run(["ffmpeg","-v","error","-i",src,"-vf","fps=2,scale=720:1280",
                    "-pix_fmt","gray","-f","rawvideo","-"], capture_output=True)
buf = np.frombuffer(p.stdout, dtype=np.uint8)
n = buf.size // (W*H)
frames = buf[:n*W*H].reshape(n, H, W).astype(np.float32)
tops, bots = [], []
for f in frames:
    reg = f[900:1280, :]
    g = np.abs(np.diff(reg, axis=0))      # 纵向梯度：字幕黑描边处极强
    strength = (g > 60).sum(axis=1)       # 每行强梯度像素数
    idx = np.where(strength > 90)[0]
    if len(idx):
        tops.append(900+int(idx.min())); bots.append(901+int(idx.max()))
tops, bots = np.array(tops), np.array(bots)
print("顶部 p1=%d 中位=%d" % (np.percentile(tops,1), np.median(tops)))
print("底部 p99=%d max=%d" % (np.percentile(bots,99), bots.max()))
```

> ⚠️ **方法选择上的两个坑**：
> 1. **纯亮度阈值会误判**：先试 `灰度>205 且该行亮像素>60`，把白衬衫与手也算了进去，得出 `min 900 / max 1279`（明显是衣服）。
> 2. **改用梯度（描边）才定位准**：字幕有黑描边，纵向梯度极强，而衣服/皮肤是软过渡。

#### 实测测量结果

| 目标 | 最终实测 | 测量手段 |
|:---|:---|:---|
| 旧字幕纵向极值 | **y = 976..1086**（p1=976，中位底 1068） | 全片 628 帧梯度扫描 |
| 台标坐标 | **x = 348..690，y = 30..60** | 裁 `crop=400:90:300:0` + `scale` 放大 3 倍读刻度 |
| 英文内容条 | **y≈0..199，x=33..719；4 个窗口累计约 14s** | 深色像素占比扫描（`<70` 占比 `>55%`） |

#### 台标坐标的修正过程（**这是 5 轮返工的根源之一**）
- 初判：按 `Penny破圈观察` 估算起点 x≈330，但**据此设的遮罩只盖到 x≥548** → 台标主体完全裸露。
- 复测：放大 3 倍读刻度，实测起点 **x=348**（比初判更靠左）。
- 再修正：`x=520` 起 → 又只盖住最右侧。
- **定稿**：`crop=368:56:336:24`（x 336..704）。

---

### 2.5 阶段五 · 遮罩渲染（**5 个版本才达标**）

#### 定稿滤镜链（v5）
```powershell
$win = "between(t,0.5,5.0)+between(t,18.5,23.5)+between(t,275.5,280.5)"
$fc = "split=2[b][w];" +
      "[b]crop=720:148:0:958,boxblur=8:2[bb];" +          # 旧字幕带 → 模糊
      "[w]crop=368:56:336:24,boxblur=12:2[wm];" +         # 台标区 → 模糊
      "[0:v][bb]overlay=0:958[t];" +                      # 贴回旧字幕位置
      "[t][wm]overlay=336:24:enable='not($win)'[out]"     # 时间门控贴回台标位置

ffmpeg -v error -i "<源片>" -filter_complex $fc -map "[out]" -map 0:a `
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a copy -y "<遮罩底片>"
```

#### 五个版本的失败与修正（完整留档）

| 版本 | 做法 | 失败表现 | 修正 |
|:---|:---|:---|:---|
| **v1** | 台标用 `drawbox=...@0.85` 半透明色块；字幕带 `crop=720:180:0:920` `boxblur=16:2` | ① 滤镜图报错 `Filter 'null:default' has output 0 (base) unconnected`<br>② 模糊带**高达 37% 屏高**，糊到人物身体<br>③ **旧字幕幽灵残影**<br>④ 台标色块**透出字影**、深色方块压浅墙很显眼 | 去掉多余 `[0:v]null[base]` 与多余黑色底；改用**局部模糊**替代色块 |
| **v2** | 收紧字幕带；台标仍用色块 | **台标没盖住**（遮罩 x≥548，实际台标从 x=348 起） | 复测台标坐标 |
| **v3** | `boxblur=16:2` | **ffmpeg 直接拒绝**：`Invalid chroma_param radius value 16, must be >= 0 and < 16`<br>→ 输出文件损坏（`moov atom not found`） | 改 `boxblur=12:2`（**色度半径上限 15**） |
| **v4** | 台标改 `boxblur=12:2`；字幕带按目视范围 | ① 模糊带顶部**切在中文行中间**，上半截汉字完整露出<br>② 英文 `very simple` 露在模糊区外<br>③ 台标达标 | 全片梯度扫描定准 976..1086 |
| **v5** | 字幕带 `crop=720:148:0:958`；台标 `crop=368:56:336:24` | 正常时段达标，但**切坏了原片顶部英文内容条**（`Building Moats Across the Merchan…` 断在半截） | **加时间门控** `enable='not(between(t,...)+...)'` |
| **定稿** | 仅台标区加时间门控 | ✅ 正常时段台标完全消除；内容条时段文字完整保留 | — |

#### 关键参数/设置（精确值）

| 项 | 值 | 依据 |
|:---|:---|:---|
| 旧字幕带遮罩 | `crop=720:148:0:958`（y 958..1106） | 实测 976..1086 + 上下余量 |
| 旧字幕模糊 | `boxblur=8:2` | 足够糊掉字，又不过度 |
| 台标遮罩 | `crop=368:56:336:24`（x 336..704, y 24..80） | 实测 348..690 / y30..60 + 余量 |
| 台标模糊 | `boxblur=12:2` | 色度半径须 <16 |
| 时间门控窗口 | `0.5–5.0`、`18.5–23.5`、`275.5–280.5` | 内容条 4 窗口各留 0.5s 余量 |
| 编码 | `libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a copy` | 与后续烧录一致 |

> 🔴 **必须标注的边界**：本阶段的**旧字幕区间、台标坐标、内容条时间窗全部是手工硬编码**，只对这条素材成立。它是「一次成功的现场作业」，**还不是可复用的能力**。

#### 验证方式（每版都做）
```powershell
ffmpeg -v error -ss 30 -i "<遮罩底片>" -frames:v 1 `
  -vf "crop=400:90:300:0,scale=1200:270:flags=neighbor" -y "chk_wm.png"
ffmpeg -v error -ss 30 -i "<遮罩底片>" -frames:v 1 `
  -vf "crop=720:140:0:930,scale=1440:280:flags=neighbor" -y "chk_sub.png"
```
**技巧**：`flags=neighbor` 放大 + `drawgrid` 画格线，用来读像素坐标。

---

### 2.6 阶段六 · 字幕烧录

#### 具体做法
```powershell
subtitle-burn run "<遮罩底片>" --srt "<优化字幕>" `
  --template clean-bar --yes --json -o "<输出目录>"
```

#### 实测结果
- 输出 `红杉_masked_clean-bar_字幕版.mp4`（76.9MB）
- **成片校验 8/8 通过**：时长差 **0ms**、分辨率一致、音轨保留、`yuv420p`、**字体真实生效**（`Source Han Sans CN Sharp Bold`，像素比对非回退）、抽样 5/5 有字幕、入场动画亮度极差 20.87
- **副产物**：`check-source` 在遮罩底片上返回 `existing_subtitles: false` —— **反证遮罩确实生效**

#### 版面计划（`plan` 不写盘）
```powershell
subtitle-burn plan "<遮罩底片>" --srt "<优化字幕>" --template clean-bar --json
```
→ 163 条**全部 `fits_safe_area: true`**，字号统一 43px，单行 y=1141..1184 / 双行 y=1084..1184。

---

### 2.7 阶段七 · 五模板批量对比（**本次唯一做对效率的环节**）

#### 具体做法
先用真 Python 解析 5 个模板的 `plan`，预判版面；再**并行**起 4 个后台渲染（clean-bar 已有），最后横向拼接对比图。

```python
# plan JSON 结构：{success, status, summary, input, srt, video, template,
#                  font_family, font_size, events, not_fit, warnings, layout[163]}
for t in ['clean-bar','punch-pop','karaoke-glow','slide-stack','title-mask']:
    r = subprocess.run(['subtitle-burn','plan',vid,'--srt',srt,'--template',t,'--json'], ...)
    j = json.loads(txt[txt.find('{'):]); L = j['layout']
```

```powershell
# 4 个后台并行
subtitle-burn run "<遮罩底片>" --srt "<优化字幕>" --template punch-pop    --yes --json -o "<out>\tpl_punch-pop"
subtitle-burn run "<遮罩底片>" --srt "<优化字幕>" --template karaoke-glow --yes --json -o "<out>\tpl_karaoke-glow"
subtitle-burn run "<遮罩底片>" --srt "<优化字幕>" --template slide-stack  --yes --json -o "<out>\tpl_slide-stack"
subtitle-burn run "<遮罩底片>" --srt "<优化字幕>" --template title-mask   --yes --json -o "<out>\tpl_title-mask"
```

```powershell
# 对比图：同一时间点 × 5 模板横向拼接
ffmpeg -v error -ss $t -i "<成片>" -frames:v 1 -vf "scale=240:-2" -y "<帧>"
ffmpeg -v error <5 个 -i> -filter_complex "hstack=inputs=5" -y "<对比条>"
ffmpeg -v error <4 个 -i> -filter_complex "[0:v][1:v][2:v][3:v]vstack=inputs=4" -y "<总览图>"
```

#### 实测结果（5 模板全部 8/8 通过）

| 模板 | 字号 | 声明/实际行数 | 每行字数 | 字幕区 y | 与旧字幕带(958–1106)冲突 |
|:---|:---|:---|:---|:---|:---|
| clean-bar | 43px | 2 / 2 | 15 | 1084..1184 | 22px（**仅 26/163 条**） |
| punch-pop | 70px | 2 / **3** | 9 | 846..1101 | 143px（163/163 全中） |
| karaoke-glow | 79px | 2 / **4** | 8 | 683..1075 | 117px（163/163 全中） |
| slide-stack | 57px | 2 / **3** | 11 | 906..1114 | 148px（163/163 全中） |
| title-mask | 90px | 2 / **4** | 7 | 416..863 | 0px（但**横跨人脸**） |

#### 关键发现（只有横向对比才能发现）
1. **文档声明 `max_lines=2` 与实际不符**：`punch-pop`/`slide-stack` 实渲 3 行，`karaoke-glow`/`title-mask` 实渲 **4 行**。原因是中文行首禁则把标点一起挪到下一行。
2. **只有 clean-bar 与本片兼容**：其他模板字幕块升到旧字幕带上方，163/163 条与之相交。
3. **`karaoke-glow` 扫光经放大验证正常**：同一行内已扫过为亮白 `PRIMARY`、未扫到为暗灰 `SECONDARY`。截图中看似「划了一道横线」实为扫光边界，非缺陷。
4. 模板自带告警：`karaoke-glow`/`title-mask` 报第 64、78、158 条阅读速度 8.0–8.2 字/秒，**略超模板上限 8**。

---

## 三、迭代与调整

### 3.1 全部返工清单（可量化）

| # | 环节 | 返工次数 | 返工原因 | 可否前置消除 |
|:---|:---|:---:|:---|:---:|
| 1 | 源片洁净度检查 | 0（但**做晚了**） | 未在探测阶段做 check-source | ✅ 可 |
| 2 | 字幕带测量 | **2 次量偏** | 目测 + 只量单行；单双行位置会浮动 | ✅ 可 |
| 3 | 台标坐标测量 | **2 次量偏** | 目测估算，未放大读刻度 | ✅ 可 |
| 4 | 遮罩渲染 | **5 个版本** | 色块→模糊、范围、半径报错、切坏内容条 | ✅ 可 |
| 5 | 写盘编码 | **1 次** | 去掉 BOM 导致 verify 红 | ✅ 可（工具侧） |
| 6 | 跨条替换 | **1 次** | 匹配串跨了两条字幕 | ✅ 可（判据侧） |
| 7 | 画面层改完 + 字幕烧录 | **2 轮完整重跑** | 先烧了字幕，之后才发现内容条被切坏 → 遮罩重做 → 字幕必须重烧 | ✅ 可 |
| 8 | 并行渲染 | 0（**做对了**） | 5 模板并行而非串行 | — |

### 3.2 返工的时间成本估算

| 项 | 单次成本 | 次数 | 合计 |
|:---|:---|:---:|:---|
| 遮罩渲染 | 约数分钟/次（314s 素材，`veryfast -crf 20`） | 5 | 约 5 倍 |
| 字幕烧录 | 约 4 分钟/次 | 6（首轮 1 + 重做后 5 模板） | 约 24 分钟 |
| 抽帧目视确认 | 每轮 1–3 次工具往返 | >10 | 交互轮次偏多 |
| ASR（若未命中缓存） | 17分36秒 | 1 | （本次已省） |

### 3.3 事后归纳的最优路径

```text
0. 前置探测（合并为一次）
   0.1 subgen model list / doctor        → 环境与模型就绪
   0.2 ffprobe                            → 规格、音视频流
   0.3 subtitle-burn check-source         → 是否自带硬字幕 + 定位台标  ★本次缺失
   → 一次性拿到：硬字幕区间、台标坐标、需要遮罩的窗口
   → 与用户一次性确认旧字幕处置 / 水印处置 / 语言

1. 遮罩底片（画面层，一次成型）
   1.1 全片梯度扫描定准硬字幕极值         ★替代两次目测
   1.2 放大读刻度定准台标坐标             ★替代两次目测
   1.3 检测内容条窗口 → 生成 enable 门控
   1.4 渲染遮罩底片 → 抽帧目视验收（正常时段 + 冲突时段各一张）

2. 转写（本机离线，命中缓存）
   subgen transcribe --language zh --simplify auto

3. 文字优化（先建基线，再定点改，最后 verify）
   3.1 subgen check --media
   3.2 复制 baseline
   3.3 逐条纠错（命中数必须为 1）
   3.4 subtitle-optimize verify → 四项硬门全绿

4. 版面预判（不写盘，5 模板批量）
   subtitle-burn plan × 5 → 校验 fits_safe_area / 行数 / 与遮罩带冲突

5. 烧录（并行）
   subtitle-burn run × N（含 --verify）

6. 成片验收 + 对比图
```

**与实测路径的差集**：`0.3` 提前（消除 #1、#7）、`1.1/1.2` 用扫描替代目测（消除 #2、#3）、`1.3+1.4` 一次到位（消除 #4 的 5 版）、`3.4` 保留 baseline+verify（消除 #5）、`4` 在烧录前预判（提前暴露模板冲突）。

---

## 四、关键细节汇总

### 4.1 工具与命令索引

| 编号 | 用途 | 命令 |
|:---|:---|:---|
| C-1 | 环境探测 | `Get-Command subgen/subtitle-optimize/subtitle-burn/ffmpeg` |
| C-2 | 规格探测 | `ffprobe -v error -show_entries format,stream …` |
| C-3 | 转写 | `subgen transcribe <src> --language zh --simplify auto -o <dir> --format srt,txt --json` |
| C-4 | 字幕体检 | `subgen check <srt> --media <video>` |
| C-5 | 时间轴校验 | `subtitle-optimize verify <baseline> <new> --json` |
| C-6 | **源片洁净度** | `subtitle-burn check-source <video> --json` |
| C-7 | 版面预判 | `subtitle-burn plan <video> --srt <srt> --template <t> --json` |
| C-8 | 烧录 | `subtitle-burn run <video> --srt <srt> --template <t> --yes --json -o <dir>` |
| C-9 | 抽帧 | `ffmpeg -v error -ss <t> -i <video> -frames:v 1 -vf "crop=…,scale=…:flags=neighbor"` |
| C-10 | 遮罩 | `ffmpeg -filter_complex "split/crop/boxblur/overlay+enable"` |
| C-11 | 对比拼接 | `ffmpeg -filter_complex "hstack=inputs=5"` / `vstack=inputs=4` |

### 4.2 实测参数速查

| 项 | 值 |
|:---|:---|
| 字体（clean-bar `text` 角色） | `Source Han Sans CN Bold`（实测非回退） |
| 字号（clean-bar，720×1280） | 43px（模板基准 5.0% × 1280 = 64px，被可用宽限制降到 43px） |
| 每行字数（clean-bar） | 15 等效全角字 |
| 每模板烧录耗时 | 约 4 分钟（314s 素材） |
| 转写 RTF | 3.363（本机基准），314s 素材约 17分36秒 |
| 缓存命中 | 0.56 秒 |
| `boxblur` 色度半径上限 | **< 16**（实测 16 被拒） |
| 渐变检测阈值 | 纵向梯度 `>60` 且该行强梯度像素 `>90` |

### 4.3 可复用的方法/模板

| 名称 | 简述 | 价值 |
|:---|:---|:---|
| **源片前置洁净度检查** | `check-source` + 全片梯度扫描 + 抽帧目视三件套 | 消除「两层字幕叠加」这类 ffmpeg 不报错的隐性事故 |
| **局部模糊替代色块** | `crop`+`boxblur`+`overlay` 处理水印/台标 | 自然、不留操作痕迹、沿背景纹理 |
| **时间门控遮罩** | `overlay=…:enable='not(between(t,a,b)+…)'` | 解决「固定区域处理」与「动态画面元素」的冲突 |
| **梯度法定位硬字幕** | 纵向梯度 + 逐行统计，替代亮度阈值 | 抗干扰（不误判白衬衫），全片收敛 |
| **基线副本 + verify** | 先复制 baseline，改完用 `verify` 证明时间轴零改动 | 把「我没动时间线」从口头承诺变成可验证报告 |
| **plan 预判 + 并行烧录** | 先批量 `plan` 校验版面，再并行 `run` | 避免「烧完才发现难看」 |

---

## 附录：萃取信号记录（供 P04 参考）

| 序号 | 场景位置 | 信号类型 | 简要描述 |
|:-----|:--------|:--------|:--------|
| 1 | 2.3 / 2.5 | **非常规解法** | 用局部 `boxblur` 替代半透明色块去台标，并加时间门控避免误伤动态内容条 |
| 2 | 2.4 | **关键判断时刻** | 亮度阈值法误判白衬衫后，改用「纵向梯度（黑描边）」定位硬字幕 |
| 3 | 2.4 | **经验依赖点** | `boxblur` 色度半径必须 <16，否则 ffmpeg 拒绝并产出损坏文件 |
| 4 | 2.2 | **绩效分化点** | 建 baseline 副本 + `verify`，把「时间轴未动」变成四项硬门的可验证结论 |
| 5 | 2.7 | **非常规解法** | 5 模板并行渲染 + `hstack/vstack` 横向对比，一轮看出全部差异 |
| 6 | 2.7 | **难点时刻** | 发现文档声明 `max_lines=2` 与实际渲染 3–4 行不符（中文行首禁则所致） |
| 7 | 2.3 | **非常规解法** | 用户假设「ROO 在字幕文字里」，实测证明在画面里，主动推翻需求前提 |
| 8 | 2.0 | **难点时刻（负向）** | 前置检查缺失导致 5 轮遮罩返工 + 2 轮完整重跑 |

> ⚠️ 以上仅为信号标记，不代表一定值得萃取，需 P04 进一步评估。

---

**报告版本**：v1.0（首次创建）
**创建时间**：本次复盘
**最后更新**：本次复盘
