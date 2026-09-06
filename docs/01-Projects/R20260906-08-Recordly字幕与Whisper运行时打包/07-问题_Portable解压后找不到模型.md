# 07 · Portable 解压后找不到模型（已按推荐逻辑修）

## 为什么用户觉得「包里没有」

zip 里有 `resources/whisper/ggml-small.bin`（约 466MB），不在 exe 旁边。  
旧逻辑只在 `app.isPackaged === true` 时看这条路径，否则只看仓库 `.tmp`（**不进 zip**）。开发态或误判未打包时，解压目录里的模型会被跳过。

## 推荐逻辑（已落地）

1. **永远**先认 `Electron.exe` 同级的 `resources/whisper/ggml-small.bin`，不看 isPackaged。  
2. 再试 `process.resourcesPath`、`app.asar` 上一级。  
3. 开发态才补 `.tmp/whisper-models`。  
4. 选手选/userData 路径若过小或不可读，回退捆绑。  
5. 识别语言固定 **zh**（简体中文），面板不再提供语言下拉。
