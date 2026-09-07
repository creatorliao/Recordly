import { CaretDown, Check, Crop, SidebarSimple } from "@phosphor-icons/react";
import type {
	CSSProperties,
	Dispatch,
	FormEvent,
	ReactNode,
	RefObject,
	SetStateAction,
} from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useI18n } from "@/contexts/I18nContext";
import type { useExportDimensions } from "../export/useExportDimensions";
import type { useExportSession } from "../export/useExportSession";
import type { useExportSettings } from "../export/useExportSettings";
import type { useExportStatusViewModel } from "../export/useExportStatusViewModel";
import type { useProjectState } from "../state/useProjectState";
import { EditorExportMenu } from "./EditorExportMenu";
import { ASPECT_RATIOS, type AspectRatio, getAspectRatioLabel } from "@/utils/aspectRatioUtils";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	headerLeftControlsPaddingClass: string;
	project: ReturnType<typeof useProjectState>;
	projectBrowserTriggerRef: RefObject<HTMLButtonElement>;
	projectNameInputRef: RefObject<HTMLInputElement>;
	projectDisplayName: string;
	hasUnsavedChanges: boolean;
	canUndo: boolean;
	canRedo: boolean;
	handleOpenProjectBrowser: () => void;
	handleOpenProjectFromLibrary: (projectPath: string) => void;
	handleReturnToRecording: () => void;
	handleSaveProject: () => void;
	handleSaveProjectAs: () => void;
	handleImportMediaOrProject: () => void;
	isMac: boolean;
	handleUndo: () => void;
	handleRedo: () => void;
	handleProjectNameSubmit: (event?: FormEvent<HTMLFormElement>) => void;
	closeProjectNameEditor: () => void;
	settingsPanelVisible: boolean;
	onToggleSettingsPanel: () => void;
	exportSettings: ReturnType<typeof useExportSettings>;
	exportSession: ReturnType<typeof useExportSession>;
	exportDimensions: ReturnType<typeof useExportDimensions>;
	exportStatus: ReturnType<typeof useExportStatusViewModel>;
	hasCaptionsForSidecar: boolean;
	nvidiaCudaExportAvailable: boolean;
	experimentalNvidiaCudaExport: boolean;
	setExperimentalNvidiaCudaExport: (enabled: boolean) => void;
	handleOpenExportDropdown: () => void;
	handleExportDropdownClose: () => void;
	handleCancelExport: () => void;
	handleRetrySaveExport: () => void;
	handleStartExportFromDropdown: () => void;
	revealExportedFile: () => void;
	exportMessage: string | null;
	aspectRatio: AspectRatio;
	setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
	isCropped: boolean;
	handleOpenCropEditor: () => void;
};

function MenubarMenu({
	label,
	triggerRef,
	children,
}: {
	label: string;
	triggerRef?: RefObject<HTMLButtonElement>;
	children: ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					ref={triggerRef}
					type="button"
					className="flex h-full items-center rounded-[5px] px-2 text-xs font-medium text-foreground/80 outline-none transition-colors hover:bg-foreground/10 hover:text-foreground"
				>
					{label}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={4} className="min-w-52">
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function EditorHeader(props: Props) {
	const {
		t,
		headerLeftControlsPaddingClass,
		project,
		projectBrowserTriggerRef,
		projectNameInputRef,
		projectDisplayName,
		hasUnsavedChanges,
		canUndo,
		canRedo,
		handleOpenProjectBrowser,
		handleOpenProjectFromLibrary,
		handleReturnToRecording,
		handleSaveProject,
		handleSaveProjectAs,
		handleImportMediaOrProject,
		isMac,
		handleUndo,
		handleRedo,
		handleProjectNameSubmit,
		closeProjectNameEditor,
		settingsPanelVisible,
		onToggleSettingsPanel,
		exportSettings,
		exportSession,
		exportDimensions,
		exportStatus,
		hasCaptionsForSidecar,
		nvidiaCudaExportAvailable,
		experimentalNvidiaCudaExport,
		setExperimentalNvidiaCudaExport,
		handleOpenExportDropdown,
		handleExportDropdownClose,
		handleCancelExport,
		handleRetrySaveExport,
		handleStartExportFromDropdown,
		revealExportedFile,
		exportMessage,
		aspectRatio,
		setAspectRatio,
		isCropped,
		handleOpenCropEditor,
	} = props;
	const {
		isEditingProjectName,
		setIsEditingProjectName,
		projectNameDraft,
		setProjectNameDraft,
		isSavingProjectName,
	} = project;
	const primaryModifierLabel = isMac ? "⌘" : "Ctrl+";
	const recentProjects = project.projectLibraryEntries.slice(0, 10);

	return (
		<div
			className="relative z-50 flex h-[30px] flex-shrink-0 items-center justify-between border-b border-foreground/10 bg-editor-header/88 px-2 backdrop-blur-md"
			style={{ WebkitAppRegion: "drag" } as CSSProperties}
		>
			<div
				className={`flex h-full items-center ${headerLeftControlsPaddingClass}`}
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
			>
				<MenubarMenu
					label={t("editor.menubar.file", "File(F)")}
					triggerRef={projectBrowserTriggerRef}
				>
					<DropdownMenuItem onSelect={() => void handleReturnToRecording()}>
						{t("editor.project.newRecording", "New recording")}
						<DropdownMenuShortcut>{primaryModifierLabel}N</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void handleImportMediaOrProject()}>
						{t("editor.project.newFromFile", "New project from file…")}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => void handleOpenProjectBrowser()}>
						{t("editor.project.open", "Open projects…")}
						<DropdownMenuShortcut>{primaryModifierLabel}O</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							{t("editor.project.openRecent", "Open recent")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="min-w-52">
							{recentProjects.length === 0 ? (
								<div className="px-2 py-1.5 text-xs text-muted-foreground">
									{t("editor.project.emptyLibrary", "No saved projects yet")}
								</div>
							) : (
								recentProjects.map((entry) => (
									<DropdownMenuItem
										key={entry.path}
										onSelect={() =>
											void handleOpenProjectFromLibrary(entry.path)
										}
									>
										<span className="truncate">{entry.name}</span>
									</DropdownMenuItem>
								))
							)}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => void handleSaveProject()}>
						{t("editor.project.save", "Save project")}
						<DropdownMenuShortcut>{primaryModifierLabel}S</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void handleSaveProjectAs()}>
						{t("editor.project.saveAs", "Save project as…")}
						<DropdownMenuShortcut>
							{isMac ? "⇧⌘S" : "Ctrl+Shift+S"}
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				</MenubarMenu>

				<MenubarMenu label={t("editor.menubar.edit", "Edit(E)")}>
					<DropdownMenuItem onSelect={handleUndo} disabled={!canUndo}>
						{t("common.actions.undo", "Undo")}
						<DropdownMenuShortcut>{primaryModifierLabel}Z</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={handleRedo} disabled={!canRedo}>
						{t("common.actions.redo", "Redo")}
						<DropdownMenuShortcut>{isMac ? "⇧⌘Z" : "Ctrl+Y"}</DropdownMenuShortcut>
					</DropdownMenuItem>
				</MenubarMenu>
			</div>

			<div
				className="absolute left-1/2 flex min-w-0 -translate-x-1/2 items-center justify-center"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
			>
				{isEditingProjectName ? (
					<form
						onSubmit={(event) => void handleProjectNameSubmit(event)}
						className="flex max-w-[min(52vw,460px)] items-baseline gap-1 rounded-[7px] border border-foreground/10 bg-editor-panel/[0.88] px-2.5 py-0.5 shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
					>
						{hasUnsavedChanges ? (
							<span className="mt-[1px] size-1.5 shrink-0 rounded-full bg-[#2563EB]" />
						) : null}
						<input
							ref={projectNameInputRef}
							type="text"
							value={projectNameDraft}
							onChange={(event) => setProjectNameDraft(event.target.value)}
							onBlur={() => {
								if (!isSavingProjectName) closeProjectNameEditor();
							}}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									closeProjectNameEditor();
								}
							}}
							disabled={isSavingProjectName}
							className="min-w-[10ch] max-w-[min(40vw,360px)] bg-transparent text-[12px] font-semibold tracking-tight text-foreground/95 outline-none placeholder:text-muted-foreground/60 disabled:cursor-wait"
							style={{ width: `${Math.max(projectNameDraft.length, 10)}ch` }}
							aria-label={t("editor.project.renameInput", "Project name")}
						/>
						<span className="shrink-0 text-[11px] font-medium tracking-tight text-muted-foreground/70">
							.recordly
						</span>
					</form>
				) : (
					<button
						type="button"
						onClick={() => setIsEditingProjectName(true)}
						className="inline-flex max-w-[min(52vw,460px)] items-baseline gap-1 rounded-[7px] px-2.5 py-0.5 transition-colors hover:bg-foreground/5"
						title={t("editor.project.renameTitle", "Rename project")}
						aria-label={t("editor.project.renameTitle", "Rename project")}
					>
						{hasUnsavedChanges ? (
							<span className="mt-[1px] size-1.5 shrink-0 rounded-full bg-[#2563EB]" />
						) : null}
						<span className="truncate text-[12px] font-semibold tracking-tight text-foreground/90">
							{projectDisplayName}
						</span>
						<span className="shrink-0 text-[11px] font-medium tracking-tight text-muted-foreground/70">
							.recordly
						</span>
					</button>
				)}
			</div>

			<div
				className="flex h-full items-center justify-self-end gap-1"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex h-6 items-center gap-1 px-1.5 text-[11px] text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
							aria-label={t("editor.layout.aspectRatio", "Aspect ratio")}
						>
							<span>{getAspectRatioLabel(aspectRatio)}</span>
							<CaretDown size={12} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="border-foreground/10 bg-editor-surface-alt"
					>
						{ASPECT_RATIOS.map((ratio) => (
							<DropdownMenuItem
								key={ratio}
								onClick={() => setAspectRatio(ratio)}
								className="flex items-center justify-between gap-3 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{getAspectRatioLabel(ratio)}
								{aspectRatio === ratio ? (
									<Check size={12} className="text-[#2563EB]" />
								) : null}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<button
					type="button"
					onClick={handleOpenCropEditor}
					className="inline-flex h-6 items-center gap-1 px-1.5 text-[11px] text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
					title={t("settings.crop.title")}
					aria-label={t("settings.crop.title")}
				>
					<Crop size={13} />
					{isCropped ? <span className="size-1 rounded-full bg-[#2563EB]" /> : null}
				</button>
				<div className="mx-1 h-4 w-px bg-foreground/15" />
				<EditorExportMenu
					t={t}
					exportSettings={exportSettings}
					exportSession={exportSession}
					exportDimensions={exportDimensions}
					exportStatus={exportStatus}
					hasCaptionsForSidecar={hasCaptionsForSidecar}
					nvidiaCudaExportAvailable={nvidiaCudaExportAvailable}
					experimentalNvidiaCudaExport={experimentalNvidiaCudaExport}
					setExperimentalNvidiaCudaExport={setExperimentalNvidiaCudaExport}
					handleOpenExportDropdown={handleOpenExportDropdown}
					handleExportDropdownClose={handleExportDropdownClose}
					handleCancelExport={handleCancelExport}
					handleRetrySaveExport={handleRetrySaveExport}
					handleStartExportFromDropdown={handleStartExportFromDropdown}
					revealExportedFile={revealExportedFile}
					exportMessage={exportMessage}
				/>
				<button
					type="button"
					onClick={onToggleSettingsPanel}
					className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
					title={t("editor.layout.toggleSideBar", "Toggle sidebar")}
					aria-label={t("editor.layout.toggleSideBar", "Toggle sidebar")}
					aria-pressed={settingsPanelVisible}
				>
					<SidebarSimple size={16} weight={settingsPanelVisible ? "fill" : "regular"} />
				</button>
			</div>
		</div>
	);
}
