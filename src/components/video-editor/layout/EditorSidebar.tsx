import {
	Camera,
	ClosedCaptioning,
	Cursor,
	Gear,
	PuzzlePiece,
	Sparkle,
	SquaresFour,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import type { useI18n } from "@/contexts/I18nContext";
import ExtensionManager from "../ExtensionManager";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import { SettingsPanel } from "../SettingsPanel";
import type { EditorEffectSection } from "../types";
import { ProjectsPanel } from "./ProjectsPanel";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	activeSection: EditorEffectSection;
	setActiveSection: Dispatch<SetStateAction<EditorEffectSection>>;
	settingsPanelVisible: boolean;
	setSettingsPanelVisible: Dispatch<SetStateAction<boolean>>;
	settingsPanelProps: ComponentProps<typeof SettingsPanel>;
	projectLibraryEntries: ProjectLibraryEntry[];
	handleOpenProjectFromLibrary: (projectPath: string) => void;
	handleImportMediaOrProject: () => void;
	handleReturnToRecording: () => void;
	isEmptyWorkspace: boolean;
};

export function EditorSidebar({
	t,
	activeSection,
	setActiveSection,
	settingsPanelVisible,
	setSettingsPanelVisible,
	settingsPanelProps,
	projectLibraryEntries,
	handleOpenProjectFromLibrary,
	handleImportMediaOrProject,
	handleReturnToRecording,
	isEmptyWorkspace,
}: Props) {
	const toolSections = useMemo(
		() => [
			{
				id: "projects" as const,
				label: t("editor.project.browserTitle", "Projects"),
				icon: SquaresFour,
			},
			{ id: "scene" as const, label: t("settings.sections.scene", "Scene"), icon: Sparkle },
			{ id: "cursor" as const, label: t("settings.sections.cursor", "Cursor"), icon: Cursor },
			{ id: "webcam" as const, label: t("settings.sections.webcam", "Webcam"), icon: Camera },
			{
				id: "captions" as const,
				label: t("settings.sections.captions", "Captions"),
				icon: ClosedCaptioning,
			},
			{
				id: "extensions" as const,
				label: t("settings.sections.extensions", "Extensions"),
				icon: PuzzlePiece,
			},
		],
		[t],
	);
	const settingsLabel = t("settings.sections.settings", "Settings");
	// 高亮 = 抽屉开着且正是这一页。抽屉收起后 section 可保留，但轨上图标必须全部熄灭（对齐 VS Code）。
	const isSectionHighlighted = (sectionId: EditorEffectSection) =>
		settingsPanelVisible && activeSection === sectionId;

	const renderItem = (section: (typeof toolSections)[number]) => {
		const isCurrent = activeSection === section.id;
		const isHighlighted = isSectionHighlighted(section.id);
		return (
			<motion.button
				key={section.id}
				type="button"
				onClick={() => {
					if (settingsPanelVisible && isCurrent) {
						setSettingsPanelVisible(false);
						return;
					}
					setActiveSection(section.id);
					setSettingsPanelVisible(true);
				}}
				data-tooltip={section.label}
				data-tooltip-side="right"
				className="group relative flex h-9 w-9 items-center justify-center outline-none focus-visible:outline-none"
				animate={{ opacity: isHighlighted ? 1 : 0.55 }}
				transition={{ duration: 0.14 }}
			>
				{isHighlighted ? (
					<span className="absolute left-0 top-1/2 h-9 w-[2px] -translate-y-1/2 bg-[#2563EB]" />
				) : null}
				<motion.span
					className="relative z-10"
					animate={{ color: isHighlighted ? "#2563EB" : "hsl(var(--foreground))" }}
					transition={{ duration: 0.14 }}
				>
					<section.icon className="h-6 w-6" weight={isHighlighted ? "fill" : "regular"} />
				</motion.span>
			</motion.button>
		);
	};

	const settingsHighlighted = isSectionHighlighted("settings");
	const settingsButton = (
		<motion.button
			type="button"
			onClick={() => {
				if (settingsPanelVisible && activeSection === "settings") {
					setSettingsPanelVisible(false);
					return;
				}
				setActiveSection("settings");
				setSettingsPanelVisible(true);
			}}
			data-tooltip={settingsLabel}
			data-tooltip-side="right"
			className="group relative flex h-9 w-9 items-center justify-center outline-none focus-visible:outline-none"
			animate={{ opacity: settingsHighlighted ? 1 : 0.55 }}
			transition={{ duration: 0.14 }}
		>
			{settingsHighlighted ? (
				<span className="absolute left-0 top-1/2 h-9 w-[2px] -translate-y-1/2 bg-[#2563EB]" />
			) : null}
			<motion.span
				className="relative z-10"
				animate={{
					color: settingsHighlighted ? "#2563EB" : "hsl(var(--foreground))",
				}}
				transition={{ duration: 0.14 }}
			>
				<Gear className="h-6 w-6" weight={settingsHighlighted ? "fill" : "regular"} />
			</motion.span>
		</motion.button>
	);

	// 项目库 300、其余抽屉页 280；关合时宽动画到 0，避免硬卸导致闪断
	const drawerWidthPx = activeSection === "projects" ? 300 : 280;

	return (
		<div className="flex h-full flex-shrink-0">
			<div className="flex h-full w-12 flex-shrink-0 flex-col items-center justify-between border-r border-foreground/16 py-2">
				<div className="flex flex-col items-center gap-1">
					{toolSections.map((section) => renderItem(section))}
				</div>
				{settingsButton}
			</div>
			<motion.div
				initial={false}
				animate={{ width: settingsPanelVisible ? drawerWidthPx : 0 }}
				transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
				className="h-full shrink-0 overflow-hidden"
				style={{ pointerEvents: settingsPanelVisible ? "auto" : "none" }}
				aria-hidden={!settingsPanelVisible}
			>
				<div className="h-full" style={{ width: drawerWidthPx }}>
					{activeSection === "projects" ? (
						<ProjectsPanel
							entries={projectLibraryEntries}
							onOpenProject={handleOpenProjectFromLibrary}
							onImportFile={handleImportMediaOrProject}
							onNewRecording={() => void handleReturnToRecording()}
							isEmptyWorkspace={isEmptyWorkspace}
						/>
					) : activeSection === "extensions" ? (
						<ExtensionManager />
					) : (
						<SettingsPanel {...settingsPanelProps} />
					)}
				</div>
			</motion.div>
		</div>
	);
}
