import {
	EyeIcon,
	EyeSlashIcon,
	FolderOpenIcon,
	TranslateIcon,
	NoteIcon,
	VideoCameraIcon,
	SunIcon,
	MoonIcon,
	DesktopIcon,
} from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useScopedT } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { CapturePreset } from "@/lib/capturePreset";
import { CAPTURE_PRESET_VALUES } from "@/lib/capturePreset";
import type { AppLocale } from "@/i18n/config";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import styles from "../LaunchWindow.module.css";
import { useLaunchPopoverCoordinator } from "./LaunchPopoverCoordinator";
import { DropdownItem, HudPopover } from "./PopoverScaffold";

const POPOVER_ID = "more";

const LOCALE_LABELS: Record<string, string> = {
	"zh-CN": "简体中文",
	en: "English",
};

const CAPTURE_PRESET_LABEL_KEYS: Record<CapturePreset, string> = {
	economy: "recording.capturePresetEconomy",
	standard: "recording.capturePresetStandard",
	high: "recording.capturePresetHigh",
};

export function MorePopover({
	trigger,
	capturePreset,
	onCapturePresetChange,
	supportsHudCaptureProtection,
	hideHudFromCapture,
	onToggleHudCaptureProtection,
	onChooseRecordingsDirectory,
	onOpenLogsFolder,
	onOpenVideoFile,
	onOpenProjectBrowser,
	appVersion,
}: {
	trigger: ReactElement;
	capturePreset: CapturePreset;
	onCapturePresetChange: (preset: CapturePreset) => void;
	supportsHudCaptureProtection: boolean;
	hideHudFromCapture: boolean;
	onToggleHudCaptureProtection: () => void;
	onChooseRecordingsDirectory: () => void;
	onOpenLogsFolder: () => void;
	onOpenVideoFile: () => void;
	onOpenProjectBrowser: () => void;
	appVersion: string | null;
}) {
	const t = useScopedT("launch");
	const { locale, setLocale, t: tGlobal } = useI18n();
	const { preference, setPreference } = useTheme();
	const { isOpen, requestOpen, requestClose } = useLaunchPopoverCoordinator();
	const open = isOpen(POPOVER_ID);

	return (
		<HudPopover
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					requestClose(POPOVER_ID);
					return;
				}
				requestOpen(POPOVER_ID);
			}}
			trigger={trigger}
			align="end"
		>
			{supportsHudCaptureProtection && (
				<DropdownItem
					icon={hideHudFromCapture ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
					selected={hideHudFromCapture}
					onClick={onToggleHudCaptureProtection}
				>
					{hideHudFromCapture
						? t("recording.hideHudFromVideo")
						: t("recording.showHudInVideo")}
				</DropdownItem>
			)}
			<DropdownItem
				icon={<FolderOpenIcon size={16} />}
				onClick={() => {
					requestClose(POPOVER_ID);
					onChooseRecordingsDirectory();
				}}
			>
				{t("recording.recordingsFolder")}
			</DropdownItem>
			<DropdownItem
				icon={<NoteIcon size={16} />}
				onClick={() => {
					requestClose(POPOVER_ID);
					onOpenLogsFolder();
				}}
			>
				{t("recording.openLogsFolder")}
			</DropdownItem>
			<DropdownItem
				icon={<VideoCameraIcon size={16} />}
				onClick={() => {
					requestClose(POPOVER_ID);
					onOpenVideoFile();
				}}
			>
				{t("recording.openVideoFile")}
			</DropdownItem>
			<DropdownItem
				icon={<FolderOpenIcon size={16} />}
				onClick={() => {
					requestClose(POPOVER_ID);
					onOpenProjectBrowser();
				}}
			>
				{t("recording.openProject")}
			</DropdownItem>
			<div className={styles.ddLabel} style={{ marginTop: 4 }}>
				{tGlobal("editor.theme.appearance")}
			</div>
			<DropdownItem
				icon={<SunIcon size={16} />}
				selected={preference === "light"}
				onClick={() => {
					setPreference("light");
					requestClose(POPOVER_ID);
				}}
			>
				{tGlobal("editor.theme.light")}
			</DropdownItem>
			<DropdownItem
				icon={<MoonIcon size={16} />}
				selected={preference === "dark"}
				onClick={() => {
					setPreference("dark");
					requestClose(POPOVER_ID);
				}}
			>
				{tGlobal("editor.theme.dark")}
			</DropdownItem>
			<DropdownItem
				icon={<DesktopIcon size={16} />}
				selected={preference === "system"}
				onClick={() => {
					setPreference("system");
					requestClose(POPOVER_ID);
				}}
			>
				{tGlobal("editor.theme.system")}
			</DropdownItem>
			<div className={styles.ddLabel} style={{ marginTop: 4 }}>
				{t("recording.capturePreset")}
			</div>
			{CAPTURE_PRESET_VALUES.map((preset) => (
				<DropdownItem
					key={preset}
					icon={<VideoCameraIcon size={16} />}
					selected={capturePreset === preset}
					onClick={() => {
						onCapturePresetChange(preset);
						requestClose(POPOVER_ID);
					}}
				>
					{t(CAPTURE_PRESET_LABEL_KEYS[preset])}
				</DropdownItem>
			))}
			<div className={styles.ddLabel} style={{ marginTop: 4 }}>
				{t("recording.language")}
			</div>
			{SUPPORTED_LOCALES.map((code) => (
				<DropdownItem
					key={code}
					icon={<TranslateIcon size={16} />}
					selected={locale === code}
					onClick={() => {
						setLocale(code as AppLocale);
						requestClose(POPOVER_ID);
					}}
				>
					{LOCALE_LABELS[code] ?? code}
				</DropdownItem>
			))}
			{appVersion && (
				<div
					style={{
						marginTop: 8,
						padding: "4px 12px",
						fontSize: 11,
						color: "var(--launch-text-muted)",
						textAlign: "center",
						userSelect: "text",
					}}
				>
					v{appVersion}
				</div>
			)}
		</HudPopover>
	);
}
