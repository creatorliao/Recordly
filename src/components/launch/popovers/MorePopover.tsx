import {
	EyeIcon,
	EyeSlashIcon,
	FolderOpenIcon,
	NoteIcon,
	VideoCameraIcon,
} from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useLaunchPopoverCoordinator } from "./LaunchPopoverCoordinator";
import { DropdownItem, HudPopover } from "./PopoverScaffold";

const POPOVER_ID = "more";

export function MorePopover({
	trigger,
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
