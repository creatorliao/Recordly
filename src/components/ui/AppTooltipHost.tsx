import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	APP_TOOLTIP_CLASS,
	adoptNativeTitle,
	computeTooltipStyle,
	findTooltipElement,
	parseTooltipSide,
	resolveTooltipSide,
	type TooltipSide,
} from "./tooltip";

const SHOW_DELAY_MS = 280;
const HIDE_DELAY_MS = 60;

type TooltipState = {
	text: string;
	top: number;
	left: number;
	transform: string;
};

function readTooltipTarget(node: EventTarget | null): HTMLElement | null {
	const el = findTooltipElement(node);
	if (el) {
		adoptNativeTitle(el);
	}
	return el;
}

/**
 * 全站共用图贴：读 data-tooltip，不再走系统原生 title。
 * 延迟出现、暗色圆角、贴边翻面。
 */
export function AppTooltipHost() {
	const [state, setState] = useState<TooltipState | null>(null);
	const showTimer = useRef<number | null>(null);
	const hideTimer = useRef<number | null>(null);
	const activeEl = useRef<HTMLElement | null>(null);
	const visibleRef = useRef(false);

	useEffect(() => {
		const clearTimers = () => {
			if (showTimer.current !== null) {
				window.clearTimeout(showTimer.current);
				showTimer.current = null;
			}
			if (hideTimer.current !== null) {
				window.clearTimeout(hideTimer.current);
				hideTimer.current = null;
			}
		};

		const hide = () => {
			clearTimers();
			activeEl.current = null;
			visibleRef.current = false;
			setState(null);
		};

		const scheduleHide = () => {
			if (hideTimer.current !== null) {
				window.clearTimeout(hideTimer.current);
			}
			hideTimer.current = window.setTimeout(hide, HIDE_DELAY_MS);
		};

		const showFor = (el: HTMLElement) => {
			const text = el.getAttribute("data-tooltip")?.trim();
			if (!text) {
				hide();
				return;
			}
			const preferred = parseTooltipSide(el.getAttribute("data-tooltip-side"));
			const rect = el.getBoundingClientRect();
			const side: TooltipSide = resolveTooltipSide(rect, preferred, {
				width: window.innerWidth,
				height: window.innerHeight,
			});
			const coords = computeTooltipStyle(rect, side);
			activeEl.current = el;
			visibleRef.current = true;
			setState({
				text,
				top: coords.top,
				left: coords.left,
				transform: coords.transform,
			});
		};

		const scheduleShow = (el: HTMLElement) => {
			if (hideTimer.current !== null) {
				window.clearTimeout(hideTimer.current);
				hideTimer.current = null;
			}
			if (activeEl.current === el && visibleRef.current) {
				showFor(el);
				return;
			}
			if (showTimer.current !== null) {
				window.clearTimeout(showTimer.current);
			}
			showTimer.current = window.setTimeout(() => showFor(el), SHOW_DELAY_MS);
		};

		const onPointerOver = (event: PointerEvent) => {
			const el = readTooltipTarget(event.target);
			if (!el) {
				if (activeEl.current || showTimer.current !== null) {
					scheduleHide();
				}
				return;
			}
			scheduleShow(el);
		};

		const onFocusIn = (event: FocusEvent) => {
			const el = readTooltipTarget(event.target);
			if (el) {
				scheduleShow(el);
			}
		};

		const onFocusOut = () => {
			scheduleHide();
		};

		document.addEventListener("pointerover", onPointerOver, true);
		document.addEventListener("focusin", onFocusIn, true);
		document.addEventListener("focusout", onFocusOut, true);
		document.addEventListener("pointerdown", hide, true);
		window.addEventListener("scroll", hide, true);
		window.addEventListener("resize", hide);

		return () => {
			clearTimers();
			document.removeEventListener("pointerover", onPointerOver, true);
			document.removeEventListener("focusin", onFocusIn, true);
			document.removeEventListener("focusout", onFocusOut, true);
			document.removeEventListener("pointerdown", hide, true);
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("resize", hide);
		};
	}, []);

	if (!state || typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div
			role="tooltip"
			className={`${APP_TOOLTIP_CLASS} fixed`}
			style={{
				top: state.top,
				left: state.left,
				transform: state.transform,
			}}
		>
			{state.text}
		</div>,
		document.body,
	);
}
