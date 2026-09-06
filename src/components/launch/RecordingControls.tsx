import { MinusIcon, PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useScopedT } from "@/contexts/I18nContext";
import { MicIcon, NotesIcon, RecordGlyph } from "./HudIcons";
import styles from "./LaunchWindow.module.css";

interface RecordingControlsProps {
	paused: boolean;
	microphoneEnabled: boolean;
	elapsed: number;
	vertical?: boolean;
	onToggleMicrophone: () => void;
	onPauseResume: () => void;
	onStopRecording: () => void;
	onHideHud: () => void;
	onCancelRecording: () => void;
	onOpenNotes?: () => void;
	formatTime: (seconds: number) => string;
}

export const RecordingControls = ({
	paused,
	microphoneEnabled,
	elapsed,
	vertical = false,
	onToggleMicrophone,
	onPauseResume,
	onStopRecording,
	onHideHud,
	onCancelRecording,
	onOpenNotes,
	formatTime,
}: RecordingControlsProps) => {
	const t = useScopedT("launch");

	const memoizedControls = useMemo(() => {
		const sep = (
			<Separator
				orientation={vertical ? "horizontal" : "vertical"}
				className={vertical ? "h-px w-6 mx-0 my-[3px]" : "mx-[5px] h-6"}
			/>
		);

		return (
			<>
				<button
					type="button"
					onClick={onStopRecording}
					data-tooltip={t("recording.stop")}
					aria-label={t("recording.stop")}
					className={`${styles.recBtn} ${styles.recBtnRecording} ${styles.electronNoDrag}`}
				>
					<RecordGlyph
						recording
						className={paused ? "text-[#fbbf24]" : "text-[#f43f5e]"}
					/>
					<span
						className={`${paused ? "text-[#fbbf24]" : "text-[#f43f5e]"} inline-block min-w-[34px] text-left text-xs font-semibold tabular-nums`}
					>
						{formatTime(elapsed)}
					</span>
				</button>

				{sep}

				<span data-tooltip={t("recording.micToggleDisabledTip")}>
					<Button
						variant="ghost"
						size="icon"
						iconSize="lg"
						className={microphoneEnabled ? styles.ibActive : ""}
						aria-label={t("recording.micToggleDisabledTip")}
						disabled
						onClick={onToggleMicrophone}
					>
						<MicIcon muted={!microphoneEnabled} />
					</Button>
				</span>

				<Button
					variant={paused ? "default" : "ghost"}
					size="icon"
					iconSize="lg"
					onClick={onPauseResume}
					title={paused ? t("recording.resume") : t("recording.pause")}
					aria-label={paused ? t("recording.resume") : t("recording.pause")}
					className={paused ? styles.ibGreen : ""}
				>
					{paused ? (
						<PlayIcon size={18} fill="currentColor" strokeWidth={0} />
					) : (
						<PauseIcon size={18} />
					)}
				</Button>

				{onOpenNotes && (
					<Button
						variant="ghost"
						size="icon"
						iconSize="lg"
						onClick={onOpenNotes}
						title={t("tooltips.openNotes")}
						aria-label={t("tooltips.openNotes")}
						data-tooltip={t("tooltips.openNotes")}
					>
						<NotesIcon />
					</Button>
				)}

				<Button
					variant="ghost"
					size="icon"
					iconSize="lg"
					onClick={onHideHud}
					title={t("recording.hideHud")}
					aria-label={t("recording.hideHud")}
				>
					<MinusIcon size={16} />
				</Button>

				<Button
					variant="ghost"
					size="icon"
					iconSize="lg"
					onClick={onCancelRecording}
					title={t("recording.cancel")}
					aria-label={t("recording.cancel")}
				>
					<XIcon size={18} />
				</Button>
			</>
		);
	}, [
		paused,
		microphoneEnabled,
		elapsed,
		vertical,
		onToggleMicrophone,
		onPauseResume,
		onStopRecording,
		onHideHud,
		onCancelRecording,
		onOpenNotes,
		formatTime,
		t,
	]);

	return memoizedControls;
};
