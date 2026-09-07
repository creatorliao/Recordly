import {
	CaretDown,
	MagicWand,
	MagnifyingGlassPlus,
	Pause,
	Play,
	Plus,
	Scissors,
	SkipBack,
	SkipForward,
	SpeakerHigh,
	SpeakerLow,
	SpeakerX,
} from "@phosphor-icons/react";
import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useI18n } from "@/contexts/I18nContext";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { CaptionEditTarget } from "../captionEditing";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { EditorVideoPreview } from "./EditorVideoPreview";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	videoPath: string | null;
	previewVersion: number;
	aspectRatio: AspectRatio;
	previewAspectRatioValue: number;
	videoPlaybackRef: RefObject<VideoPlaybackRef>;
	timelineRef: RefObject<TimelineEditorHandle>;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	setPreviewVolume: Dispatch<SetStateAction<number>>;
	suspendRendering: boolean;
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	effectiveCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	effectiveShowCursor: boolean;
	handleSaveAutoCaptionEdit: (target: CaptionEditTarget, text: string) => void;
	handleSelectAnnotation: (id: string | null) => void;
	setDuration: Dispatch<SetStateAction<number>>;
	setIsPreviewReady: Dispatch<SetStateAction<boolean>>;
	setCurrentTime: Dispatch<SetStateAction<number>>;
	setIsPlaying: Dispatch<SetStateAction<boolean>>;
	/** 只接具体错误文案；与 useProjectState 包装后的 setError 对齐，不接 updater 函数 */
	setError: (value: string | null) => void;
};

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function EditorPreviewPanel(props: Props) {
	const {
		t,
		videoPath,
		previewVersion,
		aspectRatio,
		previewAspectRatioValue,
		videoPlaybackRef,
		timelineRef,
		currentTime,
		isPlaying,
		previewVolume,
		setPreviewVolume,
		suspendRendering,
		appearance,
		timeline,
		audio,
		projection,
		playback,
		zoomCommands,
		annotationCommands,
		effectiveCursorTelemetry,
		effectiveShowCursor,
		handleSaveAutoCaptionEdit,
		handleSelectAnnotation,
		setDuration,
		setIsPreviewReady,
		setCurrentTime,
		setIsPlaying,
		setError,
	} = props;
	const previewViewportRef = useRef<HTMLDivElement>(null);
	const [previewFrameSize, setPreviewFrameSize] = useState<{
		width: number;
		height: number;
	} | null>(null);

	useEffect(() => {
		const viewport = previewViewportRef.current;
		if (
			!viewport ||
			!Number.isFinite(previewAspectRatioValue) ||
			previewAspectRatioValue <= 0
		) {
			return;
		}

		const updatePreviewFrameSize = () => {
			const availableWidth = Math.max(0, viewport.clientWidth - 8);
			const availableHeight = viewport.clientHeight;
			if (availableWidth <= 0 || availableHeight <= 0) return;

			const width = Math.min(availableWidth, availableHeight * previewAspectRatioValue);
			const height = width / previewAspectRatioValue;
			setPreviewFrameSize((current) =>
				current &&
				Math.abs(current.width - width) < 0.5 &&
				Math.abs(current.height - height) < 0.5
					? current
					: { width, height },
			);
		};

		updatePreviewFrameSize();
		const observer = new ResizeObserver(updatePreviewFrameSize);
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [previewAspectRatioValue]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-0">
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					<div
						ref={previewViewportRef}
						className="flex min-h-0 w-full flex-1 items-stretch"
						style={{ flex: "1 1 auto", margin: 0 }}
					>
						<div className="flex min-w-0 flex-1 items-center justify-center px-1">
							<div
								className="relative"
								style={{
									width: previewFrameSize?.width ?? "100%",
									height: previewFrameSize?.height ?? "auto",
									aspectRatio: previewAspectRatioValue,
									maxWidth: "100%",
									maxHeight: "100%",
									margin: "0 auto",
									boxSizing: "border-box",
								}}
							>
								<EditorVideoPreview
									videoPath={videoPath}
									previewVersion={previewVersion}
									aspectRatio={aspectRatio}
									playbackRef={videoPlaybackRef}
									currentTime={currentTime}
									isPlaying={isPlaying}
									previewVolume={previewVolume}
									suspendRendering={suspendRendering}
									appearance={appearance}
									timeline={timeline}
									audio={audio}
									effectiveZoomRegions={projection.effectiveZoomRegions}
									effectiveSpeedRegions={projection.effectiveSpeedRegions}
									effectiveCursorTelemetry={effectiveCursorTelemetry}
									effectiveShowCursor={effectiveShowCursor}
									setDuration={setDuration}
									setIsPreviewReady={setIsPreviewReady}
									setCurrentTime={setCurrentTime}
									setIsPlaying={setIsPlaying}
									setError={setError}
									handlers={{
										onSelectZoom: zoomCommands.handleSelectZoom,
										onZoomFocusChange: zoomCommands.handleZoomFocusChange,
										onEditAutoCaption: handleSaveAutoCaptionEdit,
										onSelectAnnotation: handleSelectAnnotation,
										onAnnotationPositionChange:
											annotationCommands.handleAnnotationPositionChange,
										onAnnotationSizeChange:
											annotationCommands.handleAnnotationSizeChange,
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="relative flex h-8 flex-shrink-0 items-center px-1 py-0">
				<div className="z-10 flex min-w-0 flex-1 items-center gap-1.5">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1 rounded-[3px] border border-foreground/[0.08] bg-foreground/[0.04] px-2.5 text-[11px] text-foreground/65 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)] transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="font-medium">{t("editor.toolbar.addLayer")}</span>
								<CaretDown className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="border-foreground/10 bg-editor-surface-alt"
						>
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.annotationRegions.length > 0
											? Math.max(
													...timeline.annotationRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addAnnotation(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("timeline.annotation.label")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.audioRegions.length > 0
											? Math.max(
													...timeline.audioRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addAudio(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("timeline.audio.label")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<div className="mx-1 h-4 w-px bg-foreground/10" />
					<Button
						onClick={() => timelineRef.current?.addZoom()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-[3px] text-muted-foreground transition-colors hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
						title={t("timeline.zoom.addZoom")}
					>
						<MagnifyingGlassPlus className="h-4 w-4" />
					</Button>
					<Button
						onClick={() => timelineRef.current?.suggestZooms()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-[3px] text-muted-foreground transition-colors hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
						title={t("timeline.zoom.suggestZooms")}
					>
						<MagicWand className="h-4 w-4" />
					</Button>
					<Button
						onClick={() => timelineRef.current?.splitClip()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-[3px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
						title={t("editor.toolbar.splitClip")}
					>
						<Scissors className="h-4 w-4" />
					</Button>
				</div>

				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
					<div className="pointer-events-auto flex items-center gap-1.5">
						<span className="mr-1 text-[10px] font-medium tabular-nums text-muted-foreground">
							{formatTime(projection.timelinePlayheadTime)}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-[3px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
							title={t("editor.playback.skipBack")}
							onClick={playback.handlePreviewSkipBack}
						>
							<SkipBack className="h-3.5 w-3.5" weight="fill" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className={`h-7 w-7 rounded-[3px] border border-foreground/10 shadow-[0_8px_18px_rgba(0,0,0,0.18)] transition-colors ${isPlaying ? "bg-foreground/10 text-foreground hover:bg-foreground/20" : "bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-white/90"}`}
							onClick={playback.togglePlayPause}
							title={
								isPlaying ? t("editor.playback.pause") : t("editor.playback.play")
							}
						>
							{isPlaying ? (
								<Pause className="h-3.5 w-3.5" weight="fill" />
							) : (
								<Play className="h-3.5 w-3.5" weight="fill" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
							title={t("editor.playback.skipForward")}
							onClick={playback.handlePreviewSkipForward}
						>
							<SkipForward className="h-3.5 w-3.5" weight="fill" />
						</Button>
						<span className="ml-1 text-[10px] font-medium tabular-nums text-muted-foreground/70">
							{formatTime(projection.timelineDuration)}
						</span>
					</div>
				</div>

				<div className="z-10 ml-auto flex items-center gap-2">
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							className="text-muted-foreground transition-colors hover:text-foreground"
							data-tooltip={t("editor.playback.muteUnmute")}
							onClick={() => setPreviewVolume(previewVolume <= 0.001 ? 1 : 0)}
						>
							{previewVolume <= 0.001 ? (
								<SpeakerX className="h-3.5 w-3.5" />
							) : previewVolume < 0.5 ? (
								<SpeakerLow className="h-3.5 w-3.5" />
							) : (
								<SpeakerHigh className="h-3.5 w-3.5" />
							)}
						</button>
						<div className="relative flex h-7 w-[104px] select-none items-center gap-2">
							<div
								className="absolute left-0 right-10 top-1/2 h-1 -translate-y-1/2 rounded-[2px] bg-foreground/10"
								style={{
									background: `linear-gradient(to right, #2563eb ${previewVolume * 100}%, hsl(var(--foreground) / 0.1) 0)`,
								}}
							/>
							<div
								className="pointer-events-none absolute left-0 top-1/2 z-10 h-3 w-1 -translate-y-1/2 rounded-[2px] bg-[#2563EB]"
								style={{ left: `calc(${previewVolume * 100}% - 42px)` }}
							/>
							<span className="pointer-events-none absolute right-0 text-[10px] font-medium tabular-nums text-muted-foreground">
								{Math.round(previewVolume * 100)}%
							</span>
							<input
								type="range"
								aria-label={t("editor.playback.volume", "Preview volume")}
								min="0"
								max="1"
								step="0.01"
								value={previewVolume}
								onChange={(event) => setPreviewVolume(Number(event.target.value))}
								className="absolute inset-y-0 left-0 right-10 h-full cursor-ew-resize opacity-0"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
