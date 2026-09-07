import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import {
	type EditorPresetSnapshot,
	loadEditorPresets,
	pickStyleLook,
	type StyleLookSnapshot,
} from "../editorPreferences";
import type { useExportSettings } from "../export/useExportSettings";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import { useEditorPresets } from "./useEditorPresets";

type Input = {
	t: Parameters<typeof useEditorPresets>[0]["t"];
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	exportSettings: ReturnType<typeof useExportSettings>;
	aspectRatio: AspectRatio;
	setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
	whisperExecutablePath: string | null;
	whisperModelPath: string | null;
};

export function useVideoEditorPresets({
	t,
	appearance,
	timeline,
	exportSettings,
	aspectRatio,
	setAspectRatio,
	whisperExecutablePath,
	whisperModelPath,
}: Input) {
	const [editorPresets, setEditorPresets] = useState(() => loadEditorPresets());
	const [activeEditorPresetId, setActiveEditorPresetId] = useState<string | null>(null);
	const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);
	const [presetNameDraft, setPresetNameDraft] = useState("");

	const currentSnapshot = useMemo<EditorPresetSnapshot>(
		() => ({
			wallpaper: appearance.wallpaper,
			shadowIntensity: appearance.shadowIntensity,
			backgroundBlur: appearance.backgroundBlur,
			zoomMotionBlur: appearance.zoomMotionBlur,
			zoomMotionBlurTuning: { ...appearance.zoomMotionBlurTuning },
			zoomTemporalMotionBlur: appearance.zoomTemporalMotionBlur,
			zoomMotionBlurSampleCount: appearance.zoomMotionBlurSampleCount,
			zoomMotionBlurShutterFraction: appearance.zoomMotionBlurShutterFraction,
			connectZooms: appearance.connectZooms,
			zoomInDurationMs: appearance.zoomInDurationMs,
			zoomInOverlapMs: appearance.zoomInOverlapMs,
			zoomOutDurationMs: appearance.zoomOutDurationMs,
			connectedZoomGapMs: appearance.connectedZoomGapMs,
			connectedZoomDurationMs: appearance.connectedZoomDurationMs,
			zoomInEasing: appearance.zoomInEasing,
			zoomOutEasing: appearance.zoomOutEasing,
			connectedZoomEasing: appearance.connectedZoomEasing,
			showCursor: appearance.showCursor,
			loopCursor: appearance.loopCursor,
			cursorStyle: appearance.cursorStyle,
			cursorSize: appearance.cursorSize,
			cursorSmoothing: appearance.cursorSmoothing,
			cursorSpringStiffnessMultiplier: appearance.cursorSpringStiffnessMultiplier,
			cursorSpringDampingMultiplier: appearance.cursorSpringDampingMultiplier,
			cursorSpringMassMultiplier: appearance.cursorSpringMassMultiplier,
			cameraSpringStiffnessMultiplier: appearance.cameraSpringStiffnessMultiplier,
			cameraSpringDampingMultiplier: appearance.cameraSpringDampingMultiplier,
			cameraSpringMassMultiplier: appearance.cameraSpringMassMultiplier,
			cursorMotionBlur: appearance.cursorMotionBlur,
			cursorClickEffect: appearance.cursorClickEffect,
			cursorClickEffectColor: appearance.cursorClickEffectColor,
			cursorClickEffectScale: appearance.cursorClickEffectScale,
			cursorClickEffectOpacity: appearance.cursorClickEffectOpacity,
			cursorClickEffectDurationMs: appearance.cursorClickEffectDurationMs,
			cursorClickBounce: appearance.cursorClickBounce,
			cursorClickBounceDuration: appearance.cursorClickBounceDuration,
			cursorSway: appearance.cursorSway,
			borderRadius: appearance.borderRadius,
			borderRadiusUnit: "percent",
			padding: { ...appearance.padding },
			aspectRatio,
			cropRegion: { ...appearance.cropRegion },
			webcam: (({ sourcePath: _sourcePath, ...settings }) => settings)(appearance.webcam),
			exportEncodingMode: exportSettings.exportEncodingMode,
			exportBackendPreference: exportSettings.exportBackendPreference,
			exportPipelineModel: exportSettings.exportPipelineModel,
			exportQuality: exportSettings.exportQuality,
			mp4FrameRate: exportSettings.mp4FrameRate,
			exportFormat: exportSettings.exportFormat,
			gifFrameRate: exportSettings.gifFrameRate,
			gifLoop: exportSettings.gifLoop,
			gifSizePreset: exportSettings.gifSizePreset,
			autoCaptionSettings: { ...timeline.autoCaptionSettings },
			whisperExecutablePath,
			whisperModelPath,
		}),
		[
			appearance,
			timeline.autoCaptionSettings,
			exportSettings,
			aspectRatio,
			whisperExecutablePath,
			whisperModelPath,
		],
	);

	const applySnapshot = useCallback(
		(snapshot: EditorPresetSnapshot) => {
			const look = pickStyleLook(snapshot) as StyleLookSnapshot;
			appearance.setWallpaper(look.wallpaper);
			appearance.setShadowIntensity(look.shadowIntensity);
			appearance.setBackgroundBlur(look.backgroundBlur);
			appearance.setZoomMotionBlur(look.zoomMotionBlur);
			appearance.setZoomMotionBlurTuning({ ...look.zoomMotionBlurTuning });
			appearance.setZoomTemporalMotionBlur(look.zoomTemporalMotionBlur);
			appearance.setZoomMotionBlurSampleCount(look.zoomMotionBlurSampleCount);
			appearance.setZoomMotionBlurShutterFraction(look.zoomMotionBlurShutterFraction);
			appearance.setConnectZooms(look.connectZooms);
			appearance.setZoomInDurationMs(look.zoomInDurationMs);
			appearance.setZoomInOverlapMs(look.zoomInOverlapMs);
			appearance.setZoomOutDurationMs(look.zoomOutDurationMs);
			appearance.setConnectedZoomGapMs(look.connectedZoomGapMs);
			appearance.setConnectedZoomDurationMs(look.connectedZoomDurationMs);
			appearance.setZoomInEasing(look.zoomInEasing);
			appearance.setZoomOutEasing(look.zoomOutEasing);
			appearance.setConnectedZoomEasing(look.connectedZoomEasing);
			appearance.setShowCursor(look.showCursor);
			appearance.setLoopCursor(look.loopCursor);
			appearance.setCursorStyle(look.cursorStyle);
			appearance.setCursorSize(look.cursorSize);
			appearance.setCursorSmoothing(look.cursorSmoothing);
			appearance.setCursorSpringStiffnessMultiplier(look.cursorSpringStiffnessMultiplier);
			appearance.setCursorSpringDampingMultiplier(look.cursorSpringDampingMultiplier);
			appearance.setCursorSpringMassMultiplier(look.cursorSpringMassMultiplier);
			appearance.setCameraSpringStiffnessMultiplier(look.cameraSpringStiffnessMultiplier);
			appearance.setCameraSpringDampingMultiplier(look.cameraSpringDampingMultiplier);
			appearance.setCameraSpringMassMultiplier(look.cameraSpringMassMultiplier);
			appearance.setCursorMotionBlur(look.cursorMotionBlur);
			appearance.setCursorClickEffect(look.cursorClickEffect);
			appearance.setCursorClickEffectColor(look.cursorClickEffectColor);
			appearance.setCursorClickEffectScale(look.cursorClickEffectScale);
			appearance.setCursorClickEffectOpacity(look.cursorClickEffectOpacity);
			appearance.setCursorClickEffectDurationMs(look.cursorClickEffectDurationMs);
			appearance.setCursorClickBounce(look.cursorClickBounce);
			appearance.setCursorClickBounceDuration(look.cursorClickBounceDuration);
			appearance.setCursorSway(look.cursorSway);
			appearance.setBorderRadius(look.borderRadius);
			appearance.setPadding({ ...look.padding });
			setAspectRatio(look.aspectRatio);
		},
		[appearance, setAspectRatio],
	);

	const actions = useEditorPresets({
		t,
		currentSnapshot,
		applySnapshot,
		editorPresets,
		setEditorPresets,
		activePresetId: activeEditorPresetId,
		setActivePresetId: setActiveEditorPresetId,
		presetPopoverOpen,
		presetNameDraft,
		setPresetNameDraft,
	});
	return {
		editorPresets,
		activeEditorPresetId,
		presetPopoverOpen,
		setPresetPopoverOpen,
		presetNameDraft,
		setPresetNameDraft,
		...actions,
	};
}
