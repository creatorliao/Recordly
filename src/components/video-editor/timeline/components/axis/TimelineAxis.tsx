import { useTimelineContext } from "dnd-timeline";
import { type CSSProperties, useMemo } from "react";
import { cn } from "@/lib/utils";
import { calculateAxisScale, formatTimeLabel } from "../../core/time";
import { TIMELINE_CANVAS_PAD_X_PX } from "../../timelineLayout";

interface TimelineAxisProps {
	videoDurationMs: number;
	currentTimeMs: number;
}

export default function TimelineAxis({ videoDurationMs, currentTimeMs }: TimelineAxisProps) {
	const { sidebarWidth, direction, range, valueToPixels } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";

	const { intervalMs } = useMemo(
		() => calculateAxisScale(range.end - range.start),
		[range.end, range.start],
	);

	const markers = useMemo(() => {
		if (intervalMs <= 0) {
			return { markers: [], minorTicks: [] as number[] };
		}

		const maxTime = videoDurationMs > 0 ? videoDurationMs : range.end;
		const visibleStart = Math.max(0, Math.min(range.start, maxTime));
		const visibleEnd = Math.min(range.end, maxTime);
		const markerTimes = new Set<number>();
		const firstMarker = Math.ceil(visibleStart / intervalMs) * intervalMs;

		for (let time = firstMarker; time <= visibleEnd; time += intervalMs) {
			markerTimes.add(Math.round(time));
		}

		if (visibleStart <= maxTime) markerTimes.add(Math.round(visibleStart));
		if (videoDurationMs > 0) markerTimes.add(Math.round(videoDurationMs));

		const sorted = Array.from(markerTimes)
			.filter((time) => time <= maxTime)
			.sort((a, b) => a - b);

		const minorTicks: number[] = [];
		const minorInterval = intervalMs / 5;
		for (let time = firstMarker; time <= visibleEnd; time += minorInterval) {
			const isMajor = Math.abs(time % intervalMs) < 1;
			if (!isMajor) minorTicks.push(time);
		}

		return {
			markers: sorted.map((time) => ({ time, label: formatTimeLabel(time, intervalMs) })),
			minorTicks,
		};
	}, [intervalMs, range.end, range.start, videoDurationMs]);

	const firstTime = markers.markers[0]?.time;
	const lastTime = markers.markers[markers.markers.length - 1]?.time;
	const lastTickOffset =
		lastTime === undefined
			? 0
			: TIMELINE_CANVAS_PAD_X_PX + valueToPixels(lastTime - range.start);

	return (
		<div
			className="relative h-7 overflow-hidden border-b border-foreground/10 bg-editor-bg select-none"
			style={{
				[sideProperty === "right" ? "marginRight" : "marginLeft"]: `${sidebarWidth}px`,
			}}
		>
			{markers.minorTicks.map((time) => {
				const offset = TIMELINE_CANVAS_PAD_X_PX + valueToPixels(time - range.start);
				return (
					<div
						key={`minor-${time}`}
						className="absolute bottom-0 h-1 w-[1px] bg-foreground/5"
						style={{ [sideProperty]: `${offset}px` }}
					/>
				);
			})}

			{markers.markers.map((marker) => {
				const offset = TIMELINE_CANVAS_PAD_X_PX + valueToPixels(marker.time - range.start);
				const isFirst = marker.time === firstTime;
				const isLast = marker.time === lastTime && !isFirst;
				// 中间刻度若贴着片尾数字，不再画，避免 0:30 后再漏出半个 0。
				if (!isFirst && !isLast && Math.abs(offset - lastTickOffset) < 28) {
					return null;
				}
				const edgeShift = direction === "rtl" ? "translateX(50%)" : "translateX(-50%)";
				const markerStyle: CSSProperties = {
					position: "absolute",
					bottom: 0,
					height: "100%",
					display: "flex",
					flexDirection: "row",
					alignItems: "flex-end",
					...(isFirst
						? { [sideProperty]: `${TIMELINE_CANVAS_PAD_X_PX}px` }
						: isLast
							? {
									[sideProperty === "right" ? "left" : "right"]:
										`${TIMELINE_CANVAS_PAD_X_PX}px`,
								}
							: {
									[sideProperty]: `${offset}px`,
									transform: edgeShift,
								}),
				};

				return (
					<div key={marker.time} style={markerStyle}>
						<div className="flex items-end pb-1">
							<span
								className={cn(
									"text-[10px] font-medium tabular-nums tracking-tight leading-none",
									Math.abs(marker.time - currentTimeMs) < 1
										? "text-[#2563EB]"
										: "text-foreground/40",
								)}
							>
								{marker.label}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
