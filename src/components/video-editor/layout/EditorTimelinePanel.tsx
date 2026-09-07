import type { RefObject } from "react";
import { CaretDown, CaretUp, DotsSixVertical } from "@phosphor-icons/react";
import type { useI18n } from "@/contexts/I18nContext";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useAudioRegionCommands } from "../hooks/useAudioRegionCommands";
import type { useCaptionCommands } from "../hooks/useCaptionCommands";
import type { useClipRegionCommands } from "../hooks/useClipRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useTimelineState } from "../state/useTimelineState";
import TimelineEditor, { type TimelineEditorHandle } from "../timeline/TimelineEditor";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	timelineRef: RefObject<TimelineEditorHandle>;
	timeline: ReturnType<typeof useTimelineState>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	clipCommands: ReturnType<typeof useClipRegionCommands>;
	audioCommands: ReturnType<typeof useAudioRegionCommands>;
	captionCommands: ReturnType<typeof useCaptionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	videoPath: string | null;
	videoSourcePath: string | null;
	cursorTelemetrySourcePath: string | null;
	normalizedCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	autoSuggestZoomsTrigger: number;
	handleAutoSuggestZoomsConsumed: () => void;
	disableSuggestedZooms: boolean;
	currentTime: number;
	handleSelectAnnotation: (id: string | null) => void;
	height: number;
	onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
	onResetHeight: () => void;
	onToggleCollapsed: () => void;
	isCollapsed: boolean;
	isResizing: boolean;
};

export function EditorTimelinePanel(props: Props) {
	const {
		t,
		timelineRef,
		timeline,
		projection,
		playback,
		audio,
		zoomCommands,
		clipCommands,
		audioCommands,
		captionCommands,
		annotationCommands,
		videoPath,
		videoSourcePath,
		cursorTelemetrySourcePath,
		normalizedCursorTelemetry,
		autoSuggestZoomsTrigger,
		handleAutoSuggestZoomsConsumed,
		disableSuggestedZooms,
		currentTime,
		handleSelectAnnotation,
		height,
		onResizeStart,
		onResetHeight,
		onToggleCollapsed,
		isCollapsed,
		isResizing,
	} = props;

	return (
		<div
			className={`relative flex min-h-[108px] flex-shrink-0 flex-col ${isResizing ? "" : "transition-[height] duration-150 ease-out"}`}
			style={{ height }}
		>
			<div
				className="absolute -top-2 left-0 right-0 z-30 flex h-4 cursor-row-resize items-center justify-center border-t border-foreground/15 bg-editor-bg/95"
				onPointerDown={onResizeStart}
				onDoubleClick={onResetHeight}
				role="separator"
				aria-orientation="horizontal"
				aria-label={t("editor.timeline.resize", "Resize timeline")}
				aria-valuemin={108}
				aria-valuemax={560}
				aria-valuenow={height}
			>
				<DotsSixVertical className="h-3.5 w-3.5 rotate-90 text-muted-foreground/70" />
			</div>
			<TimelineEditor
				ref={timelineRef}
				videoDuration={projection.timelineDuration}
				currentTime={currentTime}
				playheadTime={projection.timelinePlayheadTime}
				onSeek={playback.handleTimelineSeek}
				videoPath={videoPath}
				videoSourcePath={videoSourcePath}
				cursorTelemetrySourcePath={cursorTelemetrySourcePath}
				cursorTelemetry={normalizedCursorTelemetry}
				autoSuggestZoomsTrigger={autoSuggestZoomsTrigger}
				onAutoSuggestZoomsConsumed={handleAutoSuggestZoomsConsumed}
				disableSuggestedZooms={disableSuggestedZooms}
				zoomRegions={timeline.zoomRegions}
				onZoomAdded={zoomCommands.handleZoomAdded}
				onZoomSuggested={zoomCommands.handleZoomSuggested}
				onZoomSpanChange={zoomCommands.handleZoomSpanChange}
				onZoomDelete={zoomCommands.handleZoomDelete}
				selectedZoomId={timeline.selectedZoomId}
				onSelectZoom={zoomCommands.handleSelectZoom}
				trimRegions={timeline.trimRegions}
				clipRegions={timeline.clipRegions}
				onClipSplit={clipCommands.handleClipSplit}
				onClipSpanChange={clipCommands.handleClipSpanChange}
				selectedClipId={timeline.selectedClipId}
				onSelectClip={clipCommands.handleSelectClip}
				audioRegions={timeline.audioRegions}
				onAudioAdded={audioCommands.handleAudioAdded}
				onAudioSpanChange={audioCommands.handleAudioSpanChange}
				onAudioDelete={audioCommands.handleAudioDelete}
				selectedAudioId={timeline.selectedAudioId}
				onSelectAudio={audioCommands.handleSelectAudio}
				captionRegions={projection.effectiveCaptionRegions}
				onCaptionSpanChange={(id, span) =>
					captionCommands.handleCaptionRetime(id, {
						startMs: projection.mapTimelineTimeToSourceTime(span.start),
						endMs: projection.mapTimelineTimeToSourceTime(span.end),
					})
				}
				selectedCaptionId={timeline.selectedCaptionId}
				onSelectCaption={captionCommands.handleSelectCaption}
				onCaptionDelete={captionCommands.handleCaptionDelete}
				onCaptionAdded={captionCommands.handleCaptionAdded}
				captionsEnabled={timeline.autoCaptionSettings.enabled}
				captionQuickAddEnabled={timeline.autoCaptionSettings.timelineQuickAdd}
				annotationRegions={timeline.annotationRegions}
				onAnnotationAdded={annotationCommands.handleAnnotationAdded}
				onAnnotationSpanChange={annotationCommands.handleAnnotationSpanChange}
				onAnnotationDelete={annotationCommands.handleAnnotationDelete}
				selectedAnnotationId={timeline.selectedAnnotationId}
				onSelectAnnotation={handleSelectAnnotation}
				showSourceAudioTrack={timeline.clipRegions.some((clip) => clip.showSourceAudio)}
				sourceAudioResourceVersion={timeline.sourceAudioFallbackRefreshKey}
				sourceAudioTrackSettings={audio.activeSourceAudioTrackSettings}
				getSourceAudioTrackSettingsForClip={audio.getSourceAudioTrackSettingsForClip}
				onSourceAudioAvailabilityChange={timeline.setHasClipSourceAudio}
				onSourceAudioTracksMetaChange={audio.onSourceAudioTracksMetaChange}
			/>
			<button
				type="button"
				onClick={onToggleCollapsed}
				className="absolute right-2 top-1 z-20 inline-flex h-6 w-6 items-center justify-center border border-foreground/10 bg-editor-surface text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				aria-label={
					isCollapsed
						? t("editor.timeline.expand", "Expand timeline")
						: t("editor.timeline.collapse", "Collapse timeline")
				}
				title={
					isCollapsed
						? t("editor.timeline.expand", "Expand timeline")
						: t("editor.timeline.collapse", "Collapse timeline")
				}
				aria-pressed={isCollapsed}
			>
				{isCollapsed ? (
					<CaretUp className="h-3.5 w-3.5" />
				) : (
					<CaretDown className="h-3.5 w-3.5" />
				)}
			</button>
		</div>
	);
}
