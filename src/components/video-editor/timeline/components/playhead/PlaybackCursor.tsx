import { useTimelineContext } from "dnd-timeline";
import { type RefObject, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatPlayheadTime } from "../../core/time";
import { TIMELINE_CANVAS_PAD_X_PX } from "../../timelineLayout";

interface PlaybackCursorProps {
	currentTimeMs: number;
	videoDurationMs: number;
	onSeek?: (time: number) => void;
	timelineRef: RefObject<HTMLDivElement>;
	keyframes?: { id: string; time: number }[];
	isLoading?: boolean;
}

export default function PlaybackCursor({
	currentTimeMs,
	videoDurationMs,
	onSeek,
	timelineRef,
	keyframes = [],
	isLoading = false,
}: PlaybackCursorProps) {
	const { sidebarWidth, direction, range, valueToPixels, pixelsToValue } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current || !onSeek) return;
			const rect = timelineRef.current.getBoundingClientRect();
			const clickX = e.clientX - rect.left - sidebarWidth - TIMELINE_CANVAS_PAD_X_PX;
			const relativeMs = pixelsToValue(clickX);
			let absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));

			const snapThresholdMs = 150;
			const nearbyKeyframe = keyframes.find(
				(kf) =>
					Math.abs(kf.time - absoluteMs) <= snapThresholdMs &&
					kf.time >= range.start &&
					kf.time <= range.end,
			);
			if (nearbyKeyframe) absoluteMs = nearbyKeyframe.time;

			onSeek(absoluteMs / 1000);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			document.body.style.cursor = "";
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "ew-resize";

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
		};
	}, [
		isDragging,
		onSeek,
		timelineRef,
		sidebarWidth,
		range.start,
		range.end,
		videoDurationMs,
		pixelsToValue,
		keyframes,
	]);

	if (videoDurationMs <= 0 || currentTimeMs < 0) return null;
	const clampedTime = Math.min(currentTimeMs, videoDurationMs);
	if (clampedTime < range.start || clampedTime > range.end) return null;

	const offset = TIMELINE_CANVAS_PAD_X_PX + valueToPixels(clampedTime - range.start);

	return (
		<div
			className="absolute top-0 bottom-0 z-50 group/cursor"
			style={{
				[sideProperty === "right" ? "marginRight" : "marginLeft"]:
					`${sidebarWidth + TIMELINE_CANVAS_PAD_X_PX - 1}px`,
				pointerEvents: "none",
			}}
		>
			<div
				className="absolute top-0 bottom-0 w-[2px] bg-[#2563EB] cursor-ew-resize pointer-events-auto"
				style={{ [sideProperty]: `${offset}px` }}
				onMouseDown={(e) => {
					e.stopPropagation();
					setIsDragging(true);
				}}
			>
				{/* 倒三角头：对齐剪映 / Premiere / OpenScreen 小直角标。禁止菱形、发光、hover scale。视觉约 10×8，热区 16×14。 */}
				<div
					className="absolute top-0.5 left-1/2 -translate-x-1/2"
					style={{ width: 16, height: 14 }}
					aria-hidden
				>
					<svg width="10" height="8" viewBox="0 0 10 8" className="mx-auto block">
						<path d="M0 0h10L5 8z" fill="#2563EB" />
					</svg>
				</div>
				<div
					className={cn(
						"absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white/90 font-medium tabular-nums whitespace-nowrap border border-foreground/10 shadow-lg pointer-events-none transition-opacity",
						isDragging || isLoading ? "opacity-100" : "opacity-0",
					)}
				>
					<div className="flex items-center">
						{formatPlayheadTime(clampedTime)
							.split("")
							.map((char, i) => (
								<span
									key={i}
									className={cn(
										"leading-5 whitespace-pre",
										isLoading &&
											"bg-gradient-to-r from-white/40 via-white to-white/40 bg-clip-text text-transparent animate-text-shimmer",
									)}
									style={
										isLoading
											? {
													animationDelay: `${i * 0.05}s`,
													animationDuration: "2.5s",
												}
											: undefined
									}
								>
									{char}
								</span>
							))}
					</div>
				</div>
			</div>
		</div>
	);
}
