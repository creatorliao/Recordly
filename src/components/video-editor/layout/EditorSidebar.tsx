import {
	Camera,
	ClosedCaptioning,
	Cursor,
	Gear,
	PuzzlePiece,
	Sparkle,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import type { useI18n } from "@/contexts/I18nContext";
import ExtensionManager from "../ExtensionManager";
import { SettingsPanel } from "../SettingsPanel";
import type { EditorEffectSection } from "../types";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	activeSection: EditorEffectSection;
	setActiveSection: Dispatch<SetStateAction<EditorEffectSection>>;
	settingsPanelVisible: boolean;
	settingsPanelProps: ComponentProps<typeof SettingsPanel>;
};

export function EditorSidebar({
	t,
	activeSection,
	setActiveSection,
	settingsPanelVisible,
	settingsPanelProps,
}: Props) {
	const toolSections = useMemo(
		() => [
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

	const renderItem = (section: (typeof toolSections)[number], isActive: boolean) => (
		<motion.button
			key={section.id}
			type="button"
			onClick={() => setActiveSection(section.id)}
			data-tooltip={section.label}
			data-tooltip-side="right"
			className="group relative flex h-9 w-9 items-center justify-center rounded-lg outline-none focus-visible:outline-none"
			animate={{ opacity: isActive ? 1 : 0.55 }}
			transition={{ duration: 0.14 }}
		>
			{isActive ? (
				<span className="absolute left-0 top-1/2 h-[22px] w-[2px] -translate-y-1/2 rounded-full bg-[#2563EB]" />
			) : null}
			<motion.span
				className="relative z-10"
				animate={{ color: isActive ? "#2563EB" : "hsl(var(--foreground))" }}
				transition={{ duration: 0.14 }}
			>
				<section.icon
					className="h-6 w-6"
					weight={isActive ? "fill" : "regular"}
				/>
			</motion.span>
		</motion.button>
	);

	const settingsButton = (
		<motion.button
			type="button"
			onClick={() => setActiveSection("settings")}
			data-tooltip={settingsLabel}
			data-tooltip-side="right"
			className="group relative flex h-9 w-9 items-center justify-center rounded-lg outline-none focus-visible:outline-none"
			animate={{ opacity: activeSection === "settings" ? 1 : 0.55 }}
			transition={{ duration: 0.14 }}
		>
			{activeSection === "settings" ? (
				<span className="absolute left-0 top-1/2 h-[22px] w-[2px] -translate-y-1/2 rounded-full bg-[#2563EB]" />
			) : null}
			<motion.span
				className="relative z-10"
				animate={{
					color: activeSection === "settings" ? "#2563EB" : "hsl(var(--foreground))",
				}}
				transition={{ duration: 0.14 }}
			>
				<Gear className="h-6 w-6" weight={activeSection === "settings" ? "fill" : "regular"} />
			</motion.span>
		</motion.button>
	);

	return (
		<div className="flex flex-shrink-0">
			<div className="flex h-full w-12 flex-shrink-0 flex-col justify-between border-r border-foreground/10 py-2">
				<div className="flex flex-col items-center gap-1">
					{toolSections.map((section) =>
						renderItem(section, activeSection === section.id),
					)}
				</div>
				{settingsButton}
			</div>
			{settingsPanelVisible ? (
				activeSection === "extensions" ? (
					<ExtensionManager />
				) : (
					<SettingsPanel {...settingsPanelProps} />
				)
			) : null}
		</div>
	);
}
