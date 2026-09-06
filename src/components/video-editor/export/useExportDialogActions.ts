import { type RefObject, useCallback } from "react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { appLog } from "@/lib/appLog";
import type { ExportSettings } from "@/lib/exporter";
import { resolveExportStartSettings } from "../exportStartSettings";
import type { VideoPlaybackRef } from "../VideoPlayback";
import type { useExportSession } from "./useExportSession";
import type { useExportSettings } from "./useExportSettings";

type ExportSession = ReturnType<typeof useExportSession>;
type ExportSettingsState = ReturnType<typeof useExportSettings>;

type UseExportDialogActionsInput = {
	videoPath: string | null;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	hasCaptionsForSidecar: boolean;
	settings: ExportSettingsState;
	session: ExportSession;
	handleExport: (settings: ExportSettings, outputPath?: string | null) => void;
	showExportSuccessToast: (filePath: string) => void;
	/** 导出默认文件名基名（课名/未命名），不含扩展名。 */
	defaultExportFileName: string;
};

export function useExportDialogActions({
	videoPath,
	videoPlaybackRef,
	hasCaptionsForSidecar,
	settings,
	session,
	handleExport,
	showExportSuccessToast,
	defaultExportFileName,
}: UseExportDialogActionsInput) {
	const { t } = useI18n();
	const handleOpenExportDropdown = useCallback(() => {
		if (!videoPath) {
			toast.error(t("common.toasts.noVideoLoaded"));
			return;
		}

		if (session.hasPendingExportSave) {
			session.setShowExportDropdown(true);
			session.setExportError(t("common.toasts.saveDialogCanceledPending"));
			return;
		}
		session.setShowExportDropdown(true);
		session.setExportProgress(null);
		session.setExportError(null);
	}, [videoPath, session, t]);

	const handleStartExportFromDropdown = useCallback(async () => {
		const video = videoPlaybackRef.current?.video;
		if (!videoPath) {
			toast.error(t("common.toasts.noVideoLoaded"));
			return;
		}
		if (!video) {
			toast.error(t("common.toasts.videoNotReady"));
			return;
		}
		if (video.videoWidth <= 0 || video.videoHeight <= 0) {
			toast.error(t("common.toasts.videoMetadataLoading"));
			return;
		}

		const resolvedSettings = resolveExportStartSettings({
			sourceWidth: video.videoWidth,
			sourceHeight: video.videoHeight,
			exportFormat: settings.exportFormat,
			includeCaptionSidecar: hasCaptionsForSidecar && settings.includeCaptionSidecar,
			exportEncodingMode: settings.exportEncodingMode,
			exportQuality: settings.exportQuality,
			mp4FrameRate: settings.mp4FrameRate,
			exportBackendPreference: settings.exportBackendPreference,
			exportPipelineModel: settings.exportPipelineModel,
			gifFrameRate: settings.gifFrameRate,
			gifLoop: settings.gifLoop,
			gifSizePreset: settings.gifSizePreset,
		});

		// 导出先选路：编码前弹系统保存框，取消则不编码。
		const format = settings.exportFormat === "gif" ? "gif" : "mp4";
		const defaultFileName = `${defaultExportFileName}.${format}`;
		appLog({
			level: "info",
			scope: "export",
			event: "export.choose-path",
			data: { defaultFileName, format },
		});
		const chooseResult = await window.electronAPI.chooseExportPath({
			defaultFileName,
			format,
		});
		if (!chooseResult?.success || !chooseResult.path) {
			appLog({
				level: "info",
				scope: "export",
				event: "export.choose-path-canceled",
			});
			return;
		}

		session.setExportError(null);
		session.setExportedFilePath(undefined);
		session.setShowExportDropdown(true);
		handleExport(resolvedSettings, chooseResult.path);
	}, [
		videoPath,
		videoPlaybackRef,
		hasCaptionsForSidecar,
		settings,
		session,
		handleExport,
		t,
		defaultExportFileName,
	]);

	const handleCancelExport = useCallback(() => {
		if (!session.isExporting) return;
		session.cancelledExportRunIdRef.current = session.exportRunIdRef.current;
		session.exportRunIdRef.current += 1;
		session.exporterRef.current?.cancel();
		session.exporterRef.current = null;
		toast.info(t("common.toasts.exportCanceled"));
		session.clearPendingExportSave();
		session.setShowExportDropdown(false);
		session.setIsExporting(false);
		session.setExportProgress(null);
		session.setExportError(null);
		session.setExportedFilePath(undefined);
	}, [session, t]);

	const handleExportDropdownClose = useCallback(() => {
		session.clearPendingExportSave();
		session.setShowExportDropdown(false);
		session.setExportProgress(null);
		session.setExportError(null);
		session.setExportedFilePath(undefined);
	}, [session]);

	const handleRetrySaveExport = useCallback(async () => {
		const pendingSave = session.pendingExportSaveRef.current;
		if (!pendingSave) return;

		const saveResult = pendingSave.tempFilePath
			? await window.electronAPI.finalizeExportedVideo({
					tempPath: pendingSave.tempFilePath,
					fileName: pendingSave.fileName,
					outputPath: null,
					captionSidecar: pendingSave.captionSidecar,
				})
			: pendingSave.arrayBuffer
				? await window.electronAPI.saveExportedVideo(
						pendingSave.arrayBuffer,
						pendingSave.fileName,
						pendingSave.captionSidecar,
					)
				: { success: false, message: t("common.toasts.failedSaveVideo") };

		if (saveResult.canceled) {
			session.setExportError(t("common.toasts.saveDialogCanceledPending"));
			toast.info(t("common.toasts.saveCanceledRetry"));
			return;
		}
		if (saveResult.success && saveResult.path) {
			session.pendingExportSaveRef.current = null;
			session.setHasPendingExportSave(false);
			session.setExportError(null);
			session.setExportedFilePath(saveResult.path);
			showExportSuccessToast(saveResult.path);
			session.setShowExportDropdown(true);
			return;
		}

		const errorMessage = saveResult.message || t("common.toasts.failedSaveVideo");
		session.setExportError(errorMessage);
		toast.error(errorMessage);
	}, [session, showExportSuccessToast, t]);

	const revealExportedFile = useCallback(async () => {
		if (!session.exportedFilePath) return;
		try {
			const result = await window.electronAPI.revealInFolder(session.exportedFilePath);
			if (!result.success) {
				toast.error(result.error || result.message || t("common.toasts.failedRevealFolder"));
			}
		} catch (error) {
			toast.error(t("common.toasts.revealFolderError", undefined, { error: String(error) }));
		}
	}, [session.exportedFilePath, t]);

	return {
		handleOpenExportDropdown,
		handleStartExportFromDropdown,
		handleCancelExport,
		handleExportDropdownClose,
		handleRetrySaveExport,
		revealExportedFile,
	};
}
