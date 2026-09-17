# set-ass-style.ps1
# 用途：subtitle-burn 的 CLI 没有 --outline / --shadow 参数，本脚本按配置改写 ASS 的 Style 行。
#
# ASS Style 行字段序（逗号分隔，Style: 之后共 23 段）：
#   0 Name            1 Fontname        2 Fontsize      3 PrimaryColour   4 SecondaryColour
#   5 OutlineColour   6 BackColour      7 Bold          8 Italic          9 Underline
#  10 StrikeOut      11 ScaleX         12 ScaleY        13 Spacing        14 Angle
#  15 BorderStyle    16 Outline        17 Shadow        18 Alignment      19 MarginL
#  20 MarginR        21 MarginV        22 Encoding
#
# 用法：
#   .\set-ass-style.ps1 -In a.ass -Out b.ass -Outline 0 -Shadow 3
#   .\set-ass-style.ps1 -In a.ass -Out b.ass -Outline 0 -Shadow 3 -Primary FFFFFF -Bold 0

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$Outline = 0,
  [int]$Shadow  = 3,
  [string]$Primary,        # 可选：改字色，6 位十六进制（不带 #）
  [string]$OutlineColor,   # 可选：改描边色
  [int]$Bold = -1          # -1 = 不改
)

if (-not (Test-Path $In)) { throw "输入不存在: $In" }

$changed = 0
$outLines = foreach ($line in (Get-Content $In -Encoding UTF8)) {
  if ($line -match '^Style: ') {
    $f = $line.Substring(7) -split ','
    if ($f.Count -lt 23) { throw "Style 行字段数异常（$($f.Count) < 23），已中止以免写坏文件" }
    $f[16] = "$Outline"
    $f[17] = "$Shadow"
    if ($Primary)      { $f[3] = "&H00$($Primary.ToUpper())" }
    if ($OutlineColor) { $f[5] = "&H00$($OutlineColor.ToUpper())" }
    if ($Bold -ge 0)   { $f[7] = "$Bold" }
    $changed++
    'Style: ' + ($f -join ',')
  } else { $line }
}

# ASS 通常要求 UTF-8；不带 BOM 以兼容 libass
[System.IO.File]::WriteAllLines($Out, $outLines, (New-Object System.Text.UTF8Encoding($false)))

# 回显改后的样式，便于核对
$newStyle = Get-Content $Out -Encoding UTF8 | Select-String '^Style:' | Select-Object -First 1
Write-Output "已改写 $changed 条 Style：$($newStyle.Line)"
