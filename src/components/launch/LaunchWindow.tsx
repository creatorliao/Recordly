import {
	ArrowClockwiseIcon,
	CaretUpIcon,
	DotsThreeVerticalIcon,
	GearSixIcon,
	MinusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RxDragHandleDots2 } from "react-icons/rx";
import { AudioLevelMeter } from "@/components/ui/audio-level-meter";
import { Separator } from "@/components/ui/separator";
import { useScopedT } from "../../contexts/I18nContext";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { useVideoDevices } from "../../hooks/useVideoDevices";
import { loadAppSetting, saveAppSetting } from "../../lib/appSettings";
import { supportsHudCaptureProtection } from "../../lib/hudCaptureProtection";
import { Button } from "../ui/button";
import { HudInteractionContext } from "./contexts/HudInteractionContext";
import { canToggleFloatingWebcamPreview } from "./floatingWebcamPreview";
import {
	CameraIcon,
	MicIcon,
	NotesIcon,
	OpenInEditorIcon,
	OrientationIcon,
	RecordGlyph,
	SourceIcon,
	VolumeIcon,
} from "./HudIcons";
import { useHudBarDrag } from "./hooks/useHudBarDrag";
import { useLaunchHudInteractionState } from "./hooks/useLaunchHudInteractionState";
import { useLaunchWindowActions } from "./hooks/useLaunchWindowActions";
import { useLaunchWindowSystemState } from "./hooks/useLaunchWindowSystemState";
import { useRecordingTimer } from "./hooks/useRecordingTimer";
import { useWebcamPreviewOverlay } from "./hooks/useWebcamPreviewOverlay";
import styles from "./LaunchWindow.module.css";
import { MarqueeText } from "./MarqueeText";
import { CountdownPopover } from "./popovers/CountdownPopover";
import {
	LaunchPopoverCoordinatorProvider,
	useLaunchPopoverCoordinator,
} from "./popovers/LaunchPopoverCoordinator";
import { MicPopover } from "./popovers/MicPopover";
import { MorePopover } from "./popovers/MorePopover";
import { SourcePopover } from "./popovers/SourcePopover";
import { WebcamPopover } from "./popovers/WebcamPopover";
import { RecordingControls } from "./RecordingControls";

export function LaunchWindow() {
	return (
		<LaunchPopoverCoordinatorProvider>
			<LaunchWindowContent />
		</LaunchPopoverCoordinatorProvider>
	);
}

function LaunchWindowContent() {
	const t = useScopedT("launch");
	const { openId, requestOpen } = useLaunchPopoverCoordinator();

	const {
		recording,
		paused,
		finalizing,
		countdownActive,
		toggleRecording,
		pauseRecording,
		resumeRecording,
		cancelRecording,
		microphoneEnabled,
		setMicrophoneEnabled,
		microphoneDeviceId,
		setMicrophoneDeviceId,
		systemAudioEnabled,
		setSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
		webcamDeviceId,
		setWebcamDeviceId,
		countdownDelay,
		setCountdownDelay,
		preparePermissions,
	} = useScreenRecorder();

	const { elapsed, formatTime } = useRecordingTimer(recording, paused);
	const hudContentRef = useRef<HTMLDivElement>(null);
	const hudBarRef = useRef<HTMLDivElement>(null);

	const {
		selectedSource,
		hasSelectedSource,
		handleSourceSelect,
		openVideoFile,
		syncSelectedSource,
	} = useLaunchWindowActions();
	const [trayLayout, setTrayLayout] = useState<"horizontal" | "vertical">(() => {
		const saved = loadAppSetting<string>("hudTrayLayout");
		return saved === "vertical" ? "vertical" : "horizontal";
	});
	const isVertical = trayLayout === "vertical";
	const recordAfterSourceSelectionRef = useRef(false);

	const showWebcamControls = webcamEnabled && !recording;
	const { devices, selectedDeviceId, setSelectedDeviceId } = useMicrophoneDevices(
		microphoneEnabled || openId === "mic",
		microphoneDeviceId,
	);
	const {
		devices: videoDevices,
		selectedDeviceId: selectedVideoDeviceId,
		setSelectedDeviceId: setSelectedVideoDeviceId,
	} = useVideoDevices(webcamEnabled || openId === "webcam");
	const { level: micLevel } = useAudioLevelMeter({
		enabled: microphoneEnabled,
		deviceId: microphoneDeviceId ?? selectedDeviceId ?? undefined,
	});

	const {
		hudOverlayMousePassthroughSupported,
		platform,
		appVersion,
		hideHudFromCapture,
		chooseRecordingsDirectory,
		toggleHudCaptureProtection,
	} = useLaunchWindowSystemState(preparePermissions);

	const hudCaptureProtectionSupported = supportsHudCaptureProtection(platform ?? "");

	useEffect(() => {
		if (!selectedDeviceId) {
			return;
		}

		setMicrophoneDeviceId(selectedDeviceId === "default" ? undefined : selectedDeviceId);
	}, [selectedDeviceId, setMicrophoneDeviceId]);

	useEffect(() => {
		if (selectedVideoDeviceId && selectedVideoDeviceId !== "default") {
			setWebcamDeviceId(selectedVideoDeviceId);
		}
	}, [selectedVideoDeviceId, setWebcamDeviceId]);

	const {
		showFloatingWebcamPreview,
		setShowFloatingWebcamPreview,
		showRecordingWebcamPreview,
		webcamPreviewOffset,
		recordingWebcamPreviewContainerRef,
		isWebcamPreviewDraggingRef,
		webcamPreviewDragStartRef,
		handleWebcamPreviewPointerDown,
		handleWebcamPreviewPointerMove,
		handleWebcamPreviewPointerUp,
		setWebcamPreviewNode,
		setRecordingWebcamPreviewNode,
	} = useWebcamPreviewOverlay({
		webcamEnabled,
		webcamDeviceId,
		showWebcamControls,
		webcamPopoverOpen: openId === "webcam",
		hudOverlayMousePassthroughSupported,
	});

	useEffect(() => {
		window.electronAPI?.hudOverlaySetWebcamPreviewVisible?.(showRecordingWebcamPreview);
	}, [showRecordingWebcamPreview]);

	useEffect(() => {
		return () => {
			window.electronAPI?.hudOverlaySetWebcamPreviewVisible?.(false);
		};
	}, []);

	const {
		recordingHudOffset,
		isHudDragging,
		hudBarTransformRef,
		isHudDraggingRef,
		handleHudBarPointerDown,
		handleHudBarPointerMove,
		handleHudBarPointerUp,
	} = useHudBarDrag({
		hudContentRef,
		hudBarRef,
		recordingWebcamPreviewContainerRef,
	});

	const { handleHudMouseEnter, handleHudMouseLeave, beginInteractiveHudAction } =
		useLaunchHudInteractionState({
			openId,
			isHudDraggingRef,
			isWebcamPreviewDraggingRef,
			webcamPreviewDragStartRef,
		});

	useEffect(() => {
		let mounted = true;

		void window.electronAPI.getSelectedSource().then((source) => {
			if (mounted) syncSelectedSource(source);
		});

		const cleanup = window.electronAPI.onSelectedSourceChanged((source) => {
			if (mounted) syncSelectedSource(source);
		});

		return () => {
			mounted = false;
			cleanup?.();
		};
	}, [syncSelectedSource]);

	const toggleTrayLayout = useCallback(() => {
		setTrayLayout((previous) => {
			const nextLayout = previous === "horizontal" ? "vertical" : "horizontal";
			saveAppSetting("hudTrayLayout", nextLayout);
			return nextLayout;
		});
	}, []);

	const handleSourceSelectAndMaybeRecord = useCallback(
		async (source: Parameters<typeof handleSourceSelect>[0]) => {
			await handleSourceSelect(source);
			if (recordAfterSourceSelectionRef.current) {
				recordAfterSourceSelectionRef.current = false;
				toggleRecording();
			}
		},
		[handleSourceSelect, toggleRecording],
	);

	useEffect(() => {
		if (openId === "sources") {
			return;
		}
		recordAfterSourceSelectionRef.current = false;
	}, [openId]);

	const handleRecordClick = useCallback(() => {
		if (countdownActive) {
			return;
		}
		if (hasSelectedSource || platform === "linux") {
			toggleRecording();
			return;
		}
		recordAfterSourceSelectionRef.current = true;
		beginInteractiveHudAction();
		requestOpen("sources");
	}, [
		beginInteractiveHudAction,
		countdownActive,
		hasSelectedSource,
		platform,
		requestOpen,
		toggleRecording,
	]);

	const openNotes = useCallback(() => {
		void window.electronAPI?.openNotes?.();
	}, []);

	const renderHudSep = () => (
		<Separator
			orientation={isVertical ? "horizontal" : "vertical"}
			className={isVertical ? "h-px w-6 mx-0 my-[3px]" : "mx-[5px] h-6"}
		/>
	);

	const hudStateTransition = {
		duration: 0.24,
		ease: [0.22, 1, 0.36, 1] as const,
	};

	const recordingControls = (
		<RecordingControls
			paused={paused}
			microphoneEnabled={microphoneEnabled}
			elapsed={elapsed}
			vertical={isVertical}
			onToggleMicrophone={() => setMicrophoneEnabled(!microphoneEnabled)}
			onPauseResume={paused ? resumeRecording : pauseRecording}
			onStopRecording={toggleRecording}
			onHideHud={() => window.electronAPI?.hudOverlayHide?.()}
			onCancelRecording={cancelRecording}
			onOpenNotes={openNotes}
			formatTime={formatTime}
		/>
	);

	const idleControls = (
		<>
			{platform !== "linux" && (
				<>
					<SourcePopover
						selectedSource={selectedSource}
						onSourceSelect={handleSourceSelectAndMaybeRecord}
						onOpen={beginInteractiveHudAction}
						trigger={
							<Button
								variant="ghost"
								className={`${styles.electronNoDrag} group h-8 gap-1.5 ${isVertical ? "w-[34px] justify-center px-0" : "px-2 min-w-0 max-w-[160px]"} rounded-[8px] font-medium text-[12px] shrink-0 text-[var(--launch-text)] hover:bg-[var(--launch-hover)] transition-all ${openId === "sources" ? "bg-[var(--launch-hover)]" : ""}`}
								title={selectedSource}
								aria-label={selectedSource}
							>
								<SourceIcon className="shrink-0" />
								{!isVertical && (
									<>
										<div className="flex-1 min-w-0 overflow-hidden">
											<MarqueeText text={selectedSource} />
										</div>
										<CaretUpIcon
											size={10}
											className={`text-[#6b6b78] ml-0.5 shrink-0 transition-transform duration-200 ${
												openId === "sources" ? "" : "rotate-180"
											}`}
										/>
									</>
								)}
							</Button>
						}
					/>

					{renderHudSep()}
				</>
			)}

			<MicPopover
				disabled={recording}
				microphoneEnabled={microphoneEnabled}
				onDisableMicrophone={() => setMicrophoneEnabled(false)}
				devices={devices}
				microphoneDeviceId={microphoneDeviceId}
				selectedDeviceId={selectedDeviceId}
				onSelectDevice={(deviceId) => {
					setMicrophoneEnabled(true);
					setSelectedDeviceId(deviceId);
					setMicrophoneDeviceId(deviceId === "default" ? undefined : deviceId);
				}}
				trigger={
					<Button
						variant="ghost"
						size="icon"
						iconSize="lg"
						title={
							microphoneEnabled
								? t("recording.disableMicrophone")
								: t("recording.enableMicrophone")
						}
						className={microphoneEnabled ? styles.ibActive : ""}
					>
						<MicIcon muted={!microphoneEnabled} />
					</Button>
				}
			/>

			{/* 开录前麦电平：能判断麦在不在（E1） */}
			<AudioLevelMeter level={micLevel} className="w-12 shrink-0" />

			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				title={
					systemAudioEnabled
						? t("recording.disableSystemAudio")
						: t("recording.enableSystemAudio")
				}
				aria-label={t("recording.systemAudio")}
				onClick={() => setSystemAudioEnabled(!systemAudioEnabled)}
				className={systemAudioEnabled ? styles.ibActive : ""}
			>
				<VolumeIcon muted={!systemAudioEnabled} />
			</Button>

			<WebcamPopover
				disabled={recording}
				webcamEnabled={webcamEnabled}
				onDisableWebcam={() => setWebcamEnabled(false)}
				canToggleFloatingPreview={canToggleFloatingWebcamPreview(
					hudOverlayMousePassthroughSupported,
				)}
				showFloatingWebcamPreview={showFloatingWebcamPreview}
				onToggleFloatingPreview={() => setShowFloatingWebcamPreview((current) => !current)}
				showWebcamControls={showWebcamControls}
				setWebcamPreviewNode={setWebcamPreviewNode}
				videoDevices={videoDevices}
				webcamDeviceId={webcamDeviceId}
				selectedVideoDeviceId={selectedVideoDeviceId}
				onSelectVideoDevice={(deviceId) => {
					setWebcamEnabled(true);
					setSelectedVideoDeviceId(deviceId);
					setWebcamDeviceId(deviceId);
				}}
				trigger={
					<Button
						variant="ghost"
						size="icon"
						iconSize="lg"
						title={
							webcamEnabled
								? t("recording.disableWebcam")
								: t("recording.enableWebcam")
						}
						className={webcamEnabled ? styles.ibActive : ""}
					>
						<CameraIcon off={!webcamEnabled} />
					</Button>
				}
			/>

			<CountdownPopover
				countdownDelay={countdownDelay}
				onSelectDelay={setCountdownDelay}
				trigger={
					<Button
						variant="ghost"
						size="icon"
						iconSize="lg"
						title={t("recording.deviceGear")}
						aria-label={t("recording.deviceGear")}
						className={countdownDelay > 0 ? styles.ibActive : ""}
					>
						<GearSixIcon size={18} />
					</Button>
				}
			/>

			<button
				type="button"
				className={`${styles.recBtn} ${styles.electronNoDrag}`}
				onClick={handleRecordClick}
				disabled={countdownActive}
				data-tooltip={t("recording.record")}
				aria-label={t("recording.record")}
			>
				<RecordGlyph recording={false} className="text-[#f43f5e]" />
			</button>

			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				onClick={() => void window.electronAPI?.switchToEditor?.()}
				title={t("recording.openEditor")}
				aria-label={t("recording.openEditor")}
			>
				<OpenInEditorIcon />
			</Button>

			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				onClick={openNotes}
				title={t("tooltips.openNotes")}
				aria-label={t("tooltips.openNotes")}
				data-tooltip={t("tooltips.openNotes")}
			>
				<NotesIcon />
			</Button>

			{/* 不要在打开编辑器和三点之间再放分隔线：浅色条上看起来就是一颗空白按钮。 */}
			<MorePopover
				supportsHudCaptureProtection={hudCaptureProtectionSupported}
				hideHudFromCapture={hideHudFromCapture}
				onToggleHudCaptureProtection={() => {
					void toggleHudCaptureProtection();
				}}
				onChooseRecordingsDirectory={() => {
					void chooseRecordingsDirectory();
				}}
				onOpenLogsFolder={() => {
					void window.electronAPI?.openLogsFolder?.();
				}}
				onOpenVideoFile={() => {
					void openVideoFile();
				}}
				onOpenProjectBrowser={() => {
					// 条上不再藏一层项目浮层（会在「打开编辑器」旁留空白）。
					// 三点「打开项目」与魔杖钮同一条路：进完整编辑器，空态会落到项目选项卡。
					void window.electronAPI?.switchToEditor?.();
				}}
				appVersion={appVersion}
				trigger={
					<Button variant="ghost" size="icon" iconSize="lg" title={t("recording.more")}>
						<DotsThreeVerticalIcon size={18} />
					</Button>
				}
			/>

			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				onClick={() => window.electronAPI?.hudOverlayHide?.()}
				title={t("recording.hideHud")}
			>
				<MinusIcon size={16} />
			</Button>

			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				onClick={() => window.electronAPI?.hudOverlayClose?.()}
				title={t("recording.closeApp")}
			>
				<XIcon size={16} />
			</Button>
		</>
	);

	const finalizingControls = (
		<div className={styles.finalizingState}>
			<ArrowClockwiseIcon size={15} className={styles.finalizingSpin} />
			<div className={styles.finalizingCopy}>
				<span>{t("recording.preparing", "Preparing recording")}</span>
				<small>{t("recording.preparingSubtitle", "Opening the editor in a moment")}</small>
			</div>
		</div>
	);

	const hudMode = finalizing ? "finalizing" : recording ? "recording" : "idle";
	const useNativeHudBarDrag =
		platform === "linux" || hudOverlayMousePassthroughSupported === false;
	const shouldAnimateHudLayout = !recording && !showRecordingWebcamPreview && !isHudDragging;

	return (
		<HudInteractionContext.Provider
			value={{ onMouseEnter: handleHudMouseEnter, onMouseLeave: handleHudMouseLeave }}
		>
			<div
				className="w-full flex justify-center bg-transparent overflow-visible items-end pb-5 pointer-events-none"
				style={{ height: "100vh" }}
			>
				<div
					ref={hudContentRef}
					className="flex items-center overflow-visible flex-col-reverse pointer-events-none"
				>
					<div className="flex flex-col items-center pointer-events-none p-2">
						<div
							ref={hudBarTransformRef}
							style={{
								transform: `translate3d(${recordingHudOffset.x}px, ${recordingHudOffset.y}px, 0)`,
							}}
						>
							<motion.div
								ref={hudBarRef}
								layout={shouldAnimateHudLayout}
								transition={hudStateTransition}
								data-tray-layout={trayLayout}
								className={`${styles.bar} ${isVertical ? styles.barVertical : ""} launch-theme mb-2 pointer-events-auto`}
								onMouseEnter={handleHudMouseEnter}
								onMouseLeave={handleHudMouseLeave}
							>
								<div
									// Linux compositors and non-passthrough Windows fallback windows
									// need native window dragging; the JS drag path only translates
									// content inside the HUD window.
									className={`flex ${isVertical ? "h-6 w-8" : "items-center"} px-0.5 cursor-grab active:cursor-grabbing ${
										useNativeHudBarDrag ? styles.electronDrag : ""
									}`}
									onPointerDown={handleHudBarPointerDown}
									onPointerMove={handleHudBarPointerMove}
									onPointerUp={handleHudBarPointerUp}
									onPointerCancel={handleHudBarPointerUp}
								>
									<RxDragHandleDots2 size={14} className="text-[#6b6b78]" />
								</div>

								<Button
									variant="ghost"
									size="icon"
									iconSize="lg"
									type="button"
									aria-pressed={isVertical}
									aria-label={
										isVertical
											? t("tooltips.useHorizontalTray")
											: t("tooltips.useVerticalTray")
									}
									title={
										isVertical
											? t("tooltips.useHorizontalTray")
											: t("tooltips.useVerticalTray")
									}
									data-tooltip={
										isVertical
											? t("tooltips.useHorizontalTray")
											: t("tooltips.useVerticalTray")
									}
									onClick={toggleTrayLayout}
								>
									<OrientationIcon vertical={isVertical} />
								</Button>

								{renderHudSep()}

								<div className={styles.barStateViewport}>
									<AnimatePresence initial={false} mode="wait">
										<motion.div
											key={hudMode}
											layout={shouldAnimateHudLayout}
											className={`${styles.barState} ${isVertical ? styles.barStateVertical : ""}`}
											initial={{
												opacity: 0,
												y: 10,
												scale: 0.985,
												filter: "blur(8px)",
											}}
											animate={{
												opacity: 1,
												y: 0,
												scale: 1,
												filter: "blur(0px)",
											}}
											exit={{
												opacity: 0,
												y: -10,
												scale: 0.985,
												filter: "blur(6px)",
											}}
											transition={hudStateTransition}
										>
											{finalizing
												? finalizingControls
												: recording
													? recordingControls
													: idleControls}
										</motion.div>
									</AnimatePresence>
								</div>
							</motion.div>
						</div>
						{showRecordingWebcamPreview && (
							<div
								ref={recordingWebcamPreviewContainerRef}
								className={`${styles.recordingWebcamPreview} ${styles.electronNoDrag} pointer-events-auto`}
								data-hud-interactive
								data-tooltip={t("recording.webcam")}
								style={{
									transform: `translate(${webcamPreviewOffset.x}px, ${webcamPreviewOffset.y}px)`,
								}}
								onMouseEnter={handleHudMouseEnter}
								onMouseLeave={handleHudMouseLeave}
								onPointerDown={handleWebcamPreviewPointerDown}
								onPointerMove={handleWebcamPreviewPointerMove}
								onPointerUp={handleWebcamPreviewPointerUp}
								onPointerCancel={handleWebcamPreviewPointerUp}
							>
								<video
									ref={setRecordingWebcamPreviewNode}
									className={styles.recordingWebcamPreviewVideo}
									muted
									playsInline
									style={{ transform: "scaleX(-1)" }}
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</HudInteractionContext.Provider>
	);
}
