import {
	type Dispatch,
	type MutableRefObject,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
} from "react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { fromFileUrl, resolveVideoUrl } from "../projectPersistence";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useProjectState } from "../state/useProjectState";
import { DEFAULT_WEBCAM_TIME_OFFSET_MS } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";

type Set<T> = Dispatch<SetStateAction<T>>;

type UseProjectOpenActionsInput = {
	project: ReturnType<typeof useProjectState>;
	appearance: ReturnType<typeof useAppearanceState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
	hasUnsavedChanges: boolean;
	setIsPlaying: Set<boolean>;
	setCurrentTime: Set<number>;
	setDuration: Set<number>;
	applyLoadedProject: (candidate: unknown, path?: string | null) => Promise<boolean>;
	openUnsavedChangesDialog: (actionLabel: string) => Promise<"save" | "discard" | "cancel">;
	saveProject: (forceSaveAs: boolean) => Promise<boolean>;
	refreshProjectLibrary: () => Promise<void>;
	resetSourceScopedEditorState: () => void;
	applySessionPresentation: (session: null) => void;
	handleSaveProject: () => Promise<unknown>;
	handleSaveProjectAs: () => Promise<unknown>;
	isExporting: boolean;
};

export function useProjectOpenActions({
	project,
	appearance,
	videoPlaybackRef,
	pendingFreshRecordingAutoZoomPathRef,
	hasUnsavedChanges,
	setIsPlaying,
	setCurrentTime,
	setDuration,
	applyLoadedProject,
	openUnsavedChangesDialog,
	saveProject,
	refreshProjectLibrary,
	resetSourceScopedEditorState,
	applySessionPresentation,
	handleSaveProject,
	handleSaveProjectAs,
	isExporting,
}: UseProjectOpenActionsInput) {
	const { t } = useI18n();
	const confirmReplaceSourceWithUnsavedChanges = useCallback(
		async (actionLabel: string) => {
			if (!hasUnsavedChanges) return true;
			const decision = await openUnsavedChangesDialog(actionLabel);
			if (decision === "discard") return true;
			if (decision === "save") return saveProject(false);
			return false;
		},
		[hasUnsavedChanges, openUnsavedChangesDialog, saveProject],
	);

	const handleOpenProjectFromLibrary = useCallback(
		async (projectPath: string) => {
			if (
				!(await confirmReplaceSourceWithUnsavedChanges(
					t("editor.project.leaveActions.openAnother"),
				))
			)
				return;
			const result = await window.electronAPI.openProjectFileAtPath(projectPath);
			if (result.canceled) return;
			if (!result.success) {
				toast.error(t("common.toasts.projectLoadFailed"));
				return;
			}
			if (!(await applyLoadedProject(result.project, result.path ?? null))) {
				toast.error(t("common.toasts.invalidProject"));
				return;
			}
			project.setProjectBrowserOpen(false);
			await refreshProjectLibrary();
			toast.success(
				t("common.toasts.projectLoadedFrom", undefined, { path: result.path ?? "" }),
			);
		},
		[
			applyLoadedProject,
			confirmReplaceSourceWithUnsavedChanges,
			project,
			refreshProjectLibrary,
			t,
		],
	);

	const handleImportMediaOrProject = useCallback(async () => {
		if (!(await confirmReplaceSourceWithUnsavedChanges(t("editor.project.leaveActions.importFile"))))
			return;
		const result = await window.electronAPI.openVideoFilePicker({ includeProjects: true });
		if (result.canceled) return;
		if (!result.success) {
			toast.error(t("common.toasts.importFailed"));
			return;
		}
		if (result.kind === "project" || result.project) {
			if (!(await applyLoadedProject(result.project, result.path ?? null))) {
				toast.error(t("common.toasts.invalidProject"));
				return;
			}
			project.setProjectBrowserOpen(false);
			await refreshProjectLibrary();
			toast.success(
				result.path
					? t("common.toasts.projectLoadedFrom", undefined, { path: result.path })
					: t("common.toasts.projectLoaded"),
			);
			return;
		}
		if (!result.path) {
			toast.error(t("common.toasts.noMediaSelected"));
			return;
		}

		const sourcePath = fromFileUrl(result.path);
		await window.electronAPI.setCurrentVideoPath(sourcePath, { preserveProjectPath: false });
		const sourceVideoUrl = await resolveVideoUrl(sourcePath);
		try {
			videoPlaybackRef.current?.pause();
		} catch {
			// The preview may already be tearing down.
		}
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
		project.setVideoSourcePath(sourcePath);
		project.setVideoPath(sourceVideoUrl);
		project.setCurrentProjectPath(null);
		project.setLastSavedSnapshot(null);
		resetSourceScopedEditorState();
		pendingFreshRecordingAutoZoomPathRef.current = appearance.autoApplyFreshRecordingAutoZooms
			? sourceVideoUrl
			: null;
		appearance.setWebcam((previous) => ({
			...previous,
			enabled: false,
			sourcePath: null,
			timeOffsetMs: DEFAULT_WEBCAM_TIME_OFFSET_MS,
		}));
		applySessionPresentation(null);
		project.setProjectBrowserOpen(false);
		await refreshProjectLibrary();
		toast.success(t("common.toasts.mediaImported"));
	}, [
		confirmReplaceSourceWithUnsavedChanges,
		applyLoadedProject,
		project,
		appearance,
		videoPlaybackRef,
		setIsPlaying,
		setCurrentTime,
		setDuration,
		resetSourceScopedEditorState,
		pendingFreshRecordingAutoZoomPathRef,
		applySessionPresentation,
		refreshProjectLibrary,
		t,
	]);

	const handleOpenProjectBrowser = useCallback(() => {
		if (project.projectBrowserOpen) {
			project.setProjectBrowserOpen(false);
			return;
		}
		project.setProjectBrowserOpen(true);
		void refreshProjectLibrary();
	}, [project.projectBrowserOpen, project.setProjectBrowserOpen, refreshProjectLibrary]);

	/**
	 * Leaves the editor and brings the recording UI back, discarding the current
	 * project unless the user chooses to save it first.
	 */
	const handleReturnToRecording = useCallback(async () => {
		// Leaving closes the editor window, which would silently kill a running export.
		if (isExporting) {
			toast.error(t("common.toasts.waitExportBeforeReturn"));
			return;
		}

		if (!(await confirmReplaceSourceWithUnsavedChanges(t("editor.project.leaveActions.returnToRecording")))) {
			return;
		}

		try {
			videoPlaybackRef.current?.pause();
		} catch {
			// The preview may already be tearing down.
		}
		setIsPlaying(false);

		try {
			await window.electronAPI.switchToRecording();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}, [confirmReplaceSourceWithUnsavedChanges, isExporting, setIsPlaying, t, videoPlaybackRef]);

	useEffect(() => {
		const removeLoad = window.electronAPI.onMenuLoadProject(
			() => void handleOpenProjectBrowser(),
		);
		const removeSave = window.electronAPI.onMenuSaveProject(handleSaveProject);
		const removeSaveAs = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);
		return () => {
			removeLoad?.();
			removeSave?.();
			removeSaveAs?.();
		};
	}, [handleOpenProjectBrowser, handleSaveProject, handleSaveProjectAs]);

	return {
		handleOpenProjectFromLibrary,
		handleImportMediaOrProject,
		handleOpenProjectBrowser,
		handleReturnToRecording,
	};
}
