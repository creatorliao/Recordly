import { readAppSetting } from "./appSettingsStore";

/** 与渲染进程 I18nContext 写入的 app-settings 键一致。 */
export const UI_LOCALE_SETTING_KEY = "uiLocale";

export type UiLocale = "zh-CN" | "en";

const DIALOG_COPY = {
	"zh-CN": {
		saveProject: "保存 Recordly 项目",
		openProject: "打开 Recordly 项目",
		chooseRecordingsFolder: "选择录制文件夹",
		saveExportedVideo: "保存导出的视频",
		saveExportedGif: "保存导出的 GIF",
		selectVideo: "选择视频文件",
		importMediaOrProject: "导入媒体或 Recordly 项目",
		selectAudio: "选择音频文件",
		selectWhisperExe: "选择 Whisper 可执行文件",
		selectWhisperModel: "选择 Whisper 模型",
		filterRecordlyProject: "Recordly 项目",
		filterJson: "JSON",
		filterVideo: "视频文件",
		filterMediaOrProject: "媒体或 Recordly 项目",
		filterAll: "所有文件",
		filterGif: "GIF 图片",
		filterMp4: "MP4 视频",
		filterAudio: "音频文件",
		filterExecutable: "可执行文件",
		filterWhisperModel: "Whisper 模型",
	},
	en: {
		saveProject: "Save Recordly Project",
		openProject: "Open Recordly Project",
		chooseRecordingsFolder: "Choose recordings folder",
		saveExportedVideo: "Save Exported Video",
		saveExportedGif: "Save Exported GIF",
		selectVideo: "Select Video File",
		importMediaOrProject: "Import Media or Recordly Project",
		selectAudio: "Select Audio File",
		selectWhisperExe: "Select Whisper Executable",
		selectWhisperModel: "Select Whisper Model",
		filterRecordlyProject: "Recordly Project",
		filterJson: "JSON",
		filterVideo: "Video Files",
		filterMediaOrProject: "Media or Recordly Projects",
		filterAll: "All Files",
		filterGif: "GIF Image",
		filterMp4: "MP4 Video",
		filterAudio: "Audio Files",
		filterExecutable: "Executables",
		filterWhisperModel: "Whisper Models",
	},
} as const;

export type UiDialogKey = keyof (typeof DIALOG_COPY)["zh-CN"];

/** 主进程读界面语言：未写入时按产品默认简中。 */
export function getUiLocale(): UiLocale {
	return readAppSetting(UI_LOCALE_SETTING_KEY) === "en" ? "en" : "zh-CN";
}

export function uiDialog(key: UiDialogKey): string {
	return DIALOG_COPY[getUiLocale()][key];
}
