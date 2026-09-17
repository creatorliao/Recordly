<#
.SYNOPSIS
  把 whisper.cpp 的 `-ojf` 完整 JSON 转成三种「AI 友好」产物。

.DESCRIPTION
  输入：whisper-cli -m <model> -f <audio> -of <base> -ojf 产出的 <base>.json
  输出（同一目录、同一基名）：
    <base>.ai.md          人 + AI 都能读的带时间码文稿（段落级 + 词级低置信度标记）
    <base>.words.jsonl   每段一行 JSON，含 words[{text,startMs,endMs,p}]，便于程序/LLM 逐段消费
    <base>.word.vtt      WebVTT，每段带词级内联时间戳（<00:00:01.234>），用于精确音画对齐与卡拉OK

  为什么需要它：whisper.cpp 原生只给「段级」VTT/SRT，词级信息只藏在 -ojf 的 JSON 里；
  而 JSON 虽然信息最全，却不是人/LLM 直接读友好的形态。

.PARAMETER JsonPath
  whisper -ojf 产出的 .json 路径（必填）。

.PARAMETER LowConfidence
  低于该置信度（token 的 p 字段）的词在 .md 中被标出。默认 0.9。

.PARAMETER NoBom
  输出 UTF-8 不带 BOM（默认带 BOM，防 Windows 老工具中文乱码）。

.EXAMPLE
  # 先跑 whisper，再转换
  whisper-cli -m ggml-large-v3-turbo-q5_0.bin -f a.wav -l zh -ojf -of out -np
  .\whisper-json-to-ai.ps1 -JsonPath out.json

.NOTES
  实测环境：whisper.cpp v1.9.2（Windows x64）。
  ⚠️ v1.8.4 及更早版本对中日韩 token 文本有损（token.text 会出现 U+FFFD「�」），
     脚本会检测并给出警告——中文词级产物必须用 v1.9.2 及以上。
#>
[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)][string]$JsonPath,
	[double]$LowConfidence = 0.9,
	[switch]$NoBom
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $JsonPath)) { throw "找不到 JSON：$JsonPath" }

$base = [System.IO.Path]::Combine(
	[System.IO.Path]::GetDirectoryName((Resolve-Path -LiteralPath $JsonPath).Path),
	[System.IO.Path]::GetFileNameWithoutExtension($JsonPath)
)
$json = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$segments = @($json.transcription)
if ($segments.Count -eq 0) { throw "JSON 里没有 transcription 段：$JsonPath" }

$enc = New-Object System.Text.UTF8Encoding(-not $NoBom)

function Format-Ts([int]$ms, [bool]$WithMs) {
	$t = [TimeSpan]::FromMilliseconds($ms)
	if ($WithMs) { return ('{0:00}:{1:00}:{2:00}.{3:000}' -f [int]$t.TotalHours, $t.Minutes, $t.Seconds, $t.Milliseconds) }
	return ('{0:00}:{1:00}:{2:00}' -f [int]$t.TotalHours, $t.Minutes, $t.Seconds)
}

# 只保留真实 token（丢掉 [_BEG_] / [_TT_*] 这类特殊 token）
function Get-RealTokens($segment) {
	@($segment.tokens | Where-Object { $_.text -and $_.text -notmatch '^\[' })
}

# ── 数据准备 + CJK 完整性自检 ─────────────────────────────────────────────
$rows = @()
$brokenSegments = 0
foreach ($s in $segments) {
	$tokens = Get-RealTokens $s
	$joined = -join ($tokens | ForEach-Object { $_.text })
	$segText = "$($s.text)".Trim()
	$hasReplacement = ($joined -match "\uFFFD")
	if ($hasReplacement -or ($joined.Trim() -ne $segText)) { $brokenSegments++ }

	$words = foreach ($t in $tokens) {
		[ordered]@{
			text    = $t.text
			startMs = [int]$t.offsets.from
			endMs   = [int]$t.offsets.to
			p       = [double]$t.p
		}
	}
	$rows += [pscustomobject]@{
		StartMs = [int]$s.offsets.from
		EndMs   = [int]$s.offsets.to
		Text    = $segText
		Words   = @($words)
	}
}

if ($brokenSegments -gt 0) {
	Write-Warning ("有 {0}/{1} 段的词级文本与段文本不一致（含 U+FFFD「�」）。" -f $brokenSegments, $rows.Count)
	Write-Warning "这是 whisper.cpp ≤ v1.8.4 的已知问题（中日韩 token 有损）。中文词级产物请改用 v1.9.2+。"
}

# ── 产物 1：.ai.md ────────────────────────────────────────────────────────
$md = New-Object System.Collections.Generic.List[string]
$md.Add("# 转写文稿（AI 友好）")
$md.Add("")
$md.Add("> 来源：``$([System.IO.Path]::GetFileName($JsonPath))``｜模型：``$($json.model.type)``｜语言：``$($json.result.language)``｜段数：$($rows.Count)")
$md.Add("> 词级低置信度阈值 p < $LowConfidence，标记为 **[?]**。")
$md.Add("")
$md.Add("## 时间码文稿")
$md.Add("")
foreach ($r in $rows) {
	$annotated = ($r.Words | ForEach-Object {
			if ($_.p -lt $LowConfidence) { "**[{0}]**" -f $_.text } else { $_.text }
		}) -join ''
	$md.Add(("### [{0} → {1}]" -f (Format-Ts $r.StartMs $false), (Format-Ts $r.EndMs $false)))
	$md.Add("")
	$md.Add($annotated)
	$md.Add("")
}
$md.Add("## 低置信度词清单（人工校对用）")
$md.Add("")
$md.Add("| 词 | 起 | 止 | p | 所属段 |")
$md.Add("|:--|--:|--:|--:|:--|")
foreach ($r in $rows) {
	foreach ($w in $r.Words) {
		if ($w.p -lt $LowConfidence) {
			$md.Add(("| ``{0}`` | {1} | {2} | {3:N3} | {4} |" -f $w.text, $w.startMs, $w.endMs, $w.p, (Format-Ts $r.StartMs $false)))
		}
	}
}
$md.Add("")
$mdPath = "$base.ai.md"
[System.IO.File]::WriteAllText($mdPath, ($md -join "`r`n"), $enc)

# ── 产物 2：.words.jsonl ─────────────────────────────────────────────────
$jsonl = foreach ($r in $rows) {
	([ordered]@{
			startMs = $r.StartMs
			endMs   = $r.EndMs
			text    = $r.Text
			words   = $r.Words
		} | ConvertTo-Json -Depth 6 -Compress)
}
$jsonlPath = "$base.words.jsonl"
[System.IO.File]::WriteAllLines($jsonlPath, [string[]]$jsonl, $enc)

# ── 产物 3：.word.vtt（词级内联时间戳）────────────────────────────────────
$vtt = New-Object System.Collections.Generic.List[string]
$vtt.Add("WEBVTT")
$vtt.Add("")
$vtt.Add("NOTE 词级内联时间戳：播放器按 <ts> 切分并高亮，可用于卡拉OK与精确对齐")
$vtt.Add("")
for ($i = 0; $i -lt $rows.Count; $i++) {
	$r = $rows[$i]
	$vtt.Add(("{0}" -f ($i + 1)))
	$vtt.Add(("{0} --> {1}" -f (Format-Ts $r.StartMs $true), (Format-Ts $r.EndMs $true)))
	$inline = -join ($r.Words | ForEach-Object { "<{0}>{1}" -f (Format-Ts $_.startMs $true), $_.text })
	$vtt.Add($inline)
	$vtt.Add("")
}
$vttPath = "$base.word.vtt"
[System.IO.File]::WriteAllLines($vttPath, [string[]]$vtt, $enc)

# ── 汇报 ─────────────────────────────────────────────────────────────────
[pscustomobject]@{
	段数       = $rows.Count
	词数       = ($rows | ForEach-Object { $_.Words.Count } | Measure-Object -Sum).Sum
	低置信度词 = ($rows | ForEach-Object { @($_.Words | Where-Object { $_.p -lt $LowConfidence }).Count } | Measure-Object -Sum).Sum
	完整性告警 = $brokenSegments
	产物       = ($mdPath, $jsonlPath, $vttPath) -join ' ; '
} | Format-List
