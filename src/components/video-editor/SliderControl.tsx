import type { PointerEvent as ReactPointerEvent } from "react";
import { memo, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface SliderControlProps {
	label: string;
	value: number;
	defaultValue: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	formatValue: (value: number) => string;
	parseInput: (text: string) => number | null;
	accentColor?: "purple" | "blue";
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function quantizeToStep(value: number, min: number, step: number) {
	if (!(step > 0)) {
		return value;
	}

	return min + Math.round((value - min) / step) * step;
}

export const SliderControl = memo(function SliderControl({
	label,
	value,
	defaultValue: _defaultValue,
	min,
	max,
	step,
	onChange,
	formatValue,
	parseInput: _parseInput,
	accentColor = "blue",
}: SliderControlProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const valueTextRef = useRef<HTMLSpanElement | null>(null);
	const boundsRef = useRef<DOMRect | null>(null);
	const requestRef = useRef<number | null>(null);

	const pct = Math.min(100, Math.max(0, ((value - min) / (max - min || 1)) * 100));

	const dividerClass = accentColor === "purple" ? "bg-violet-500" : "bg-[#2563EB]";

	// Sync initial and prop-driven changes to CSS variable
	useEffect(() => {
		if (rootRef.current) {
			rootRef.current.style.setProperty("--slider-pct", String(pct / 100));
		}
	}, [pct]);

	const updateValue = useCallback(
		(clientX: number) => {
			const bounds = boundsRef.current;
			if (!bounds || bounds.width <= 6) {
				return;
			}

			const normalized = clamp((clientX - (bounds.left + 3)) / (bounds.width - 6), 0, 1);
			const rawValue = min + normalized * (max - min);
			const nextValue = clamp(quantizeToStep(rawValue, min, step), min, max);
			const finalValue = Number(nextValue.toFixed(6));
			const finalPct = (((finalValue - min) / (max - min || 1)) * 100).toFixed(4);

			// Direct DOM update for instant feedback
			if (rootRef.current) {
				rootRef.current.style.setProperty("--slider-pct", String(Number(finalPct) / 100));
				rootRef.current.setAttribute("aria-valuenow", String(finalValue));
				rootRef.current.setAttribute("aria-valuetext", formatValue(finalValue));
			}
			if (valueTextRef.current) {
				valueTextRef.current.textContent = formatValue(finalValue);
			}

			// Notify parent
			onChange(finalValue);
		},
		[max, min, onChange, step, formatValue],
	);

	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			const pointerId = event.pointerId;
			const target = event.currentTarget;

			// Cache bounds to avoid layout thrashing during move
			boundsRef.current = target.getBoundingClientRect();

			target.setPointerCapture(pointerId);
			updateValue(event.clientX);

			const handlePointerMove = (moveEvent: PointerEvent) => {
				if (moveEvent.pointerId !== pointerId) {
					return;
				}

				if (requestRef.current) {
					cancelAnimationFrame(requestRef.current);
				}

				requestRef.current = requestAnimationFrame(() => {
					updateValue(moveEvent.clientX);
				});
			};

			const finishPointer = (finishEvent: PointerEvent) => {
				if (finishEvent.pointerId !== pointerId) {
					return;
				}

				if (requestRef.current) {
					cancelAnimationFrame(requestRef.current);
					requestRef.current = null;
				}

				if (finishEvent.type === "pointerup") {
					updateValue(finishEvent.clientX);
				}

				target.releasePointerCapture(pointerId);
				target.removeEventListener("pointermove", handlePointerMove);
				target.removeEventListener("pointerup", finishPointer);
				target.removeEventListener("pointercancel", finishPointer);
				boundsRef.current = null;
			};

			target.addEventListener("pointermove", handlePointerMove);
			target.addEventListener("pointerup", finishPointer);
			target.addEventListener("pointercancel", finishPointer);
		},
		[updateValue],
	);

	return (
		<div
			ref={rootRef}
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			aria-valuetext={formatValue(value)}
			onPointerDown={handlePointerDown}
			onKeyDown={(event) => {
				if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
					event.preventDefault();
					onChange(clamp(quantizeToStep(value - step, min, step), min, max));
				}

				if (event.key === "ArrowRight" || event.key === "ArrowUp") {
					event.preventDefault();
					onChange(clamp(quantizeToStep(value + step, min, step), min, max));
				}
			}}
			className="relative grid h-7 w-full select-none grid-cols-[72px_minmax(0,1fr)_44px] items-center gap-2 px-0.5 outline-none focus-visible:ring-1 focus-visible:ring-[#2563EB]/40"
			style={
				{
					"--slider-pct": String(pct / 100),
				} as React.CSSProperties
			}
		>
			<div
				className="pointer-events-none absolute left-[74px] right-[46px] top-1/2 h-1 -translate-y-1/2 rounded-[2px] bg-foreground/10 transition-none"
				style={{
					background: `linear-gradient(to right, ${accentColor === "purple" ? "#8b5cf6" : "#2563eb"} calc(var(--slider-pct) * 100%), hsl(var(--foreground) / 0.1) 0)`,
				}}
			/>
			<div
				className={cn(
					"pointer-events-none absolute top-1/2 z-10 h-3 w-1 -translate-y-1/2 rounded-[2px] transition-none",
					dividerClass,
				)}
				style={{
					left: "calc(74px + var(--slider-pct) * (100% - 120px) - 2px)",
				}}
			/>
			<span className="pointer-events-none relative z-10 truncate text-[11px] font-medium text-muted-foreground">
				{label}
			</span>
			<span
				ref={valueTextRef}
				className="pointer-events-none relative z-10 truncate text-right text-[11px] font-medium tabular-nums text-foreground"
			>
				{formatValue(value)}
			</span>
		</div>
	);
});
