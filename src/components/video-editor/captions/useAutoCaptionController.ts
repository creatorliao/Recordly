import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";
import { resolveAutoCaptionSourcePath } from "../autoCaptionSource";
import { type CaptionEditTarget, updateCaptionCuesForEditedTarget } from "../captionEditing";
import { resolveVideoUrl } from "../projectPersistence";
import type { AutoCaptionSettings, CaptionCue } from "../types";
import { getErrorMessage } from "../videoEditorUtils";

type DownloadStatus = "idle" | "downloading" | "downloaded" | "error";
type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseAutoCaptionControllerParams {
	t: Translator;
	videoPath: string | null;
	setVideoPath: Dispatch<SetStateAction<string | null>>;
	videoSourcePath: string | null;
	setVideoSourcePath: Dispatch<SetStateAction<string | null>>;
	webcamSourcePath: string | null;
	whisperExecutablePath: string | null;
	setWhisperExecutablePath: Dispatch<SetStateAction<string | null>>;
	whisperModelPath: string | null;
	setWhisperModelPath: Dispatch<SetStateAction<string | null>>;
	downloadedWhisperModelPath: string | null;
	setDownloadedWhisperModelPath: Dispatch<SetStateAction<string | null>>;
	whisperModelDownloadStatus: DownloadStatus;
	setWhisperModelDownloadStatus: Dispatch<SetStateAction<DownloadStatus>>;
	setWhisperModelDownloadProgress: Dispatch<SetStateAction<number>>;
	isGeneratingCaptions: boolean;
	setIsGeneratingCaptions: Dispatch<SetStateAction<boolean>>;
	autoCaptionSettings: AutoCaptionSettings;
	setAutoCaptionSettings: Dispatch<SetStateAction<AutoCaptionSettings>>;
	setAutoCaptions: Dispatch<SetStateAction<CaptionCue[]>>;
	syncActiveVideoSource: (sourcePath: string, webcamPath?: string | null) => Promise<void>;
	isExporting?: boolean;
}

export function useAutoCaptionController({
	t,
	videoPath,
	setVideoPath,
	videoSourcePath,
	setVideoSourcePath,
	webcamSourcePath,
	whisperExecutablePath,
	setWhisperExecutablePath,
	whisperModelPath,
	setWhisperModelPath,
	downloadedWhisperModelPath,
	setDownloadedWhisperModelPath,
	whisperModelDownloadStatus,
	setWhisperModelDownloadStatus,
	setWhisperModelDownloadProgress,
	isGeneratingCaptions,
	setIsGeneratingCaptions,
	setAutoCaptionSettings,
	setAutoCaptions,
	syncActiveVideoSource,
	isExporting = false,
}: UseAutoCaptionControllerParams) {
	const captionGenerationInFlightRef = useRef(false);
	const [whisperModelIsBundled, setWhisperModelIsBundled] = useState(false);

	useEffect(() => {
		const unsubscribe = window.electronAPI.onWhisperSmallModelDownloadProgress((state) => {
			setWhisperModelDownloadStatus(state.status);
			setWhisperModelDownloadProgress(state.progress);
			if (state.status === "downloaded") {
				setDownloadedWhisperModelPath(state.path ?? null);
				setWhisperModelPath((current) => current ?? state.path ?? null);
			} else if (state.status === "idle") {
				setDownloadedWhisperModelPath(null);
				setWhisperModelIsBundled(false);
			} 			else if (state.status === "error" && state.error) {
				notifyError(state.error, { scope: "captions", event: "captions.generate-failed" });
			}
		});

		void window.electronAPI.getWhisperSmallModelStatus().then((result) => {
			if (!result.success) return;
			if (result.exists && result.path) {
				setDownloadedWhisperModelPath(result.path);
				setWhisperModelPath((current) => current ?? result.path ?? null);
				setWhisperModelIsBundled(result.source === "bundled");
				setWhisperModelDownloadStatus("downloaded");
				setWhisperModelDownloadProgress(100);
			} else {
				setDownloadedWhisperModelPath(null);
				setWhisperModelIsBundled(false);
				setWhisperModelDownloadStatus("idle");
				setWhisperModelDownloadProgress(0);
			}
		});

		return () => unsubscribe?.();
	}, [
		setDownloadedWhisperModelPath,
		setWhisperModelDownloadProgress,
		setWhisperModelDownloadStatus,
		setWhisperModelPath,
	]);

	const handlePickWhisperExecutable = useCallback(async () => {
		const result = await window.electronAPI.openWhisperExecutablePicker();
		if (!result.success || !result.path) return;
		setWhisperExecutablePath(result.path);
		toast.success(t("common.toasts.whisperExeSelected"));
	}, [setWhisperExecutablePath]);

	const handleDownloadWhisperSmallModel = useCallback(async () => {
		if (whisperModelDownloadStatus === "downloading") return;
		setWhisperModelDownloadStatus("downloading");
		setWhisperModelDownloadProgress(0);
		const result = await window.electronAPI.downloadWhisperSmallModel();
		if (!result.success) {
			setWhisperModelDownloadStatus("error");
			notifyError(result.error || t("common.toasts.whisperDownloadFailed"), {
				scope: "captions",
				event: "captions.generate-failed",
			});
			return;
		}
		if (result.path) {
			setDownloadedWhisperModelPath(result.path);
			setWhisperModelPath(result.path);
		}
	}, [
		setDownloadedWhisperModelPath,
		setWhisperModelDownloadProgress,
		setWhisperModelDownloadStatus,
		setWhisperModelPath,
		whisperModelDownloadStatus,
	]);

	const handlePickWhisperModel = useCallback(async () => {
		const result = await window.electronAPI.openWhisperModelPicker();
		if (!result.success || !result.path) return;
		setWhisperModelPath(result.path);
		toast.success(t("common.toasts.whisperModelSelected"));
	}, [setWhisperModelPath]);

	const handleDeleteWhisperSmallModel = useCallback(async () => {
		const result = await window.electronAPI.deleteWhisperSmallModel();
		if (!result.success) {
			notifyError(result.error || t("common.toasts.whisperDeleteFailed"), {
				scope: "captions",
				event: "captions.generate-failed",
			});
			return;
		}
		const status = await window.electronAPI.getWhisperSmallModelStatus();
		if (status.success && status.exists && status.path) {
			setWhisperModelPath(status.path);
			setDownloadedWhisperModelPath(status.path);
			setWhisperModelIsBundled(status.source === "bundled");
			setWhisperModelDownloadStatus("downloaded");
			setWhisperModelDownloadProgress(100);
			toast.success(t("common.toasts.whisperModelDeleted"));
			return;
		}
		setWhisperModelPath((current) => (current === downloadedWhisperModelPath ? null : current));
		setDownloadedWhisperModelPath(null);
		setWhisperModelIsBundled(false);
		setWhisperModelDownloadStatus("idle");
		setWhisperModelDownloadProgress(0);
		toast.success(t("common.toasts.whisperModelDeleted"));
	}, [
		downloadedWhisperModelPath,
		setDownloadedWhisperModelPath,
		setWhisperModelDownloadProgress,
		setWhisperModelDownloadStatus,
		setWhisperModelPath,
	]);

	const handleGenerateAutoCaptions = useCallback(async () => {
		if (isExporting) {
			notifyError(
				t(
					"common.toasts.captionsWaitForExport",
					"导出完成后再生成字幕，避免整机卡住。",
				),
				{
				scope: "captions",
				event: "captions.generate-failed",
			});
			return;
		}
		if (captionGenerationInFlightRef.current || isGeneratingCaptions) return;
		captionGenerationInFlightRef.current = true;
		setIsGeneratingCaptions(true);
		try {
			let sourcePath = resolveAutoCaptionSourcePath({ videoSourcePath, videoPath });
			if (!sourcePath) {
				const sessionResult = await window.electronAPI.getCurrentRecordingSession?.();
				const currentVideoResult = await window.electronAPI.getCurrentVideoPath();
				sourcePath = resolveAutoCaptionSourcePath({
					recordingSessionVideoPath:
						sessionResult?.success && sessionResult.session?.videoPath
							? sessionResult.session.videoPath
							: null,
					currentVideoPath: currentVideoResult.success
						? (currentVideoResult.path ?? null)
						: null,
				});
			}
			if (!sourcePath) {
				notifyError(t("common.toasts.noSourceVideo"), {
					scope: "captions",
					event: "captions.generate-failed",
				});
				return;
			}
			await syncActiveVideoSource(sourcePath, webcamSourcePath);
			if (sourcePath !== videoSourcePath) {
				setVideoSourcePath(sourcePath);
				setVideoPath(await resolveVideoUrl(sourcePath));
			}
			let modelPath = whisperModelPath;
			if (!modelPath) {
				const status = await window.electronAPI.getWhisperSmallModelStatus();
				if (status.success && status.path) {
					modelPath = status.path;
					setWhisperModelPath(status.path);
					setWhisperModelIsBundled(status.source === "bundled");
				}
			}
			// 不选手选路径；主进程会落到捆绑 / userData 默认模型
			const result = await window.electronAPI.generateAutoCaptions({
				videoPath: sourcePath,
				whisperExecutablePath: whisperExecutablePath ?? undefined,
				whisperModelPath: modelPath ?? undefined,
				language: "zh",
			});
			if (!result.success || !result.cues) {
				const errorMessage = result.error ? getErrorMessage(result.error) : result.message;
				notifyError(errorMessage || t("common.toasts.generateCaptionsFailed"), {
					scope: "captions",
					event: "captions.generate-failed",
				});
				return;
			}
			setAutoCaptions(result.cues);
			if (result.cues.length > 0) {
				setAutoCaptionSettings((current) => ({ ...current, enabled: true }));
			}
			toast.success(
				result.message ||
					t("common.toasts.generatedCaptions", undefined, {
						count: result.cues.length,
					}),
			);
		} catch (error) {
			notifyError(getErrorMessage(error), {
				scope: "captions",
				event: "captions.generate-failed",
			});
		} finally {
			captionGenerationInFlightRef.current = false;
			setIsGeneratingCaptions(false);
		}
	}, [
		isExporting,
		isGeneratingCaptions,
		setAutoCaptionSettings,
		setAutoCaptions,
		setIsGeneratingCaptions,
		setVideoPath,
		setVideoSourcePath,
		syncActiveVideoSource,
		videoPath,
		videoSourcePath,
		webcamSourcePath,
		whisperExecutablePath,
		whisperModelPath,
	]);

	const handleSaveAutoCaptionEdit = useCallback(
		(target: CaptionEditTarget, text: string) => {
			setAutoCaptions((captions) => updateCaptionCuesForEditedTarget(captions, target, text));
			toast.success(t("settings.captions.editSaved", "Caption updated"));
		},
		[setAutoCaptions, t],
	);

	return {
		whisperModelIsBundled,
		handlePickWhisperExecutable,
		handleDownloadWhisperSmallModel,
		handlePickWhisperModel,
		handleDeleteWhisperSmallModel,
		handleGenerateAutoCaptions,
		handleSaveAutoCaptionEdit,
	};
}
