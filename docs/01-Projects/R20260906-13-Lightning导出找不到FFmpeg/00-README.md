# Lightning 导出找不到 FFmpeg

> 主题：Portable 包默认 Lightning 导出失败，`spawn …\app.asar\node_modules\ffmpeg-static\ffmpeg.exe ENOENT`。  
> 夹由 `para-structure cp` 创建：`R20260906-13-Lightning导出找不到FFmpeg`。  
> 与采集 helper 是**同一类路径 bug**（`isPackaged` 为假时不改写 unpacked），采集已在 beta.9 修过，导出这条漏了。

| 文件 | 内容 |
|------|------|
| [`01-问题_Lightning导出ffmpeg在asar里ENOENT.md`](01-问题_Lightning导出ffmpeg在asar里ENOENT.md) | 现状 / 根因 / 方案 / 日志怎么验已经修好 |
| [`09-执行留痕.md`](09-执行留痕.md) | 四要素 |

相邻：

- Portable 采集 helper 同因：`R20260906-04/10`
- 会话日志约定：`R20260906-11`
- 播放闪屏（已过）：`R20260906-12`

工作分支：`dev-creator`。仅 Windows。金路径落点 **G1 导出顺**。
