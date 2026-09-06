import { useCallback, useState } from "react";
import { appLog } from "@/lib/appLog";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import type { EditorProjectData } from "../projectPersistence";

export function useProjectState() {
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
	const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
	const [projectLibraryEntries, setProjectLibraryEntries] = useState<ProjectLibraryEntry[]>([]);
	const [projectBrowserOpen, setProjectBrowserOpen] = useState(false);
	const [isEditingProjectName, setIsEditingProjectName] = useState(false);
	const [projectNameDraft, setProjectNameDraft] = useState("");
	const [isSavingProjectName, setIsSavingProjectName] = useState(false);
	const [projectSaveDialogOpen, setProjectSaveDialogOpen] = useState(false);
	const [projectSaveDialogDraft, setProjectSaveDialogDraft] = useState("");
	const [isSavingProjectDialog, setIsSavingProjectDialog] = useState(false);
	const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] = useState(false);
	const [unsavedChangesDialogActionLabel, setUnsavedChangesDialogActionLabel] =
		useState("continue");
	const [lastSavedSnapshot, setLastSavedSnapshot] = useState<EditorProjectData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setErrorState] = useState<string | null>(null);
	// 必须稳定：曾每次渲染新建函数，VideoPlayback 的 Pixi effect 把 onError 当依赖，
	// 一点播放 / 时间一走就拆掉画布，画面闪、进度钉死（beta.8 会话日志 texture-mount 连刷）。
	const setError = useCallback((value: string | null) => {
		if (value) {
			appLog({
				level: "error",
				scope: "editor",
				event: "ui.page-error",
				msg: value,
				data: { userMessage: value },
			});
		}
		setErrorState(value);
	}, []);

	return {
		videoPath,
		setVideoPath,
		videoSourcePath,
		setVideoSourcePath,
		currentProjectPath,
		setCurrentProjectPath,
		projectLibraryEntries,
		setProjectLibraryEntries,
		projectBrowserOpen,
		setProjectBrowserOpen,
		isEditingProjectName,
		setIsEditingProjectName,
		projectNameDraft,
		setProjectNameDraft,
		isSavingProjectName,
		setIsSavingProjectName,
		projectSaveDialogOpen,
		setProjectSaveDialogOpen,
		projectSaveDialogDraft,
		setProjectSaveDialogDraft,
		isSavingProjectDialog,
		setIsSavingProjectDialog,
		unsavedChangesDialogOpen,
		setUnsavedChangesDialogOpen,
		unsavedChangesDialogActionLabel,
		setUnsavedChangesDialogActionLabel,
		lastSavedSnapshot,
		setLastSavedSnapshot,
		loading,
		setLoading,
		error,
		setError,
	};
}
