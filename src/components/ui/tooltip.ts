/** 全站图贴几何：暗色圆角浮层，避开系统原生 title 的黑框白底。 */

export function adoptNativeTitle(el: HTMLElement): void {
	const title = el.getAttribute("title");
	if (!title?.trim()) {
		return;
	}
	if (!el.getAttribute("data-tooltip")?.trim()) {
		el.setAttribute("data-tooltip", title.trim());
	}
	// 立刻摘掉原生 title，否则 Windows 会再弹出黑框白底。
	el.removeAttribute("title");
}

export function findTooltipElement(node: EventTarget | null): HTMLElement | null {
	if (!(node instanceof Element)) {
		return null;
	}
	const marked = node.closest("[data-tooltip]");
	if (marked instanceof HTMLElement) {
		return marked;
	}
	const titled = node.closest("[title]");
	return titled instanceof HTMLElement ? titled : null;
}

export type TooltipSide = "top" | "bottom" | "left" | "right";

export const APP_TOOLTIP_CLASS =
	"pointer-events-none z-[80] max-w-[240px] rounded-lg bg-[#1c1c1f] px-2.5 py-1.5 text-left text-[12px] font-medium leading-snug text-white shadow-[0_8px_24px_rgba(15,23,42,0.22)]";

const DEFAULT_GAP = 8;

export function computeTooltipStyle(
	rect: { top: number; left: number; width: number; height: number },
	side: TooltipSide,
	gap = DEFAULT_GAP,
): { top: number; left: number; transform: string } {
	switch (side) {
		case "bottom":
			return {
				top: rect.top + rect.height + gap,
				left: rect.left + rect.width / 2,
				transform: "translate(-50%, 0)",
			};
		case "left":
			return {
				top: rect.top + rect.height / 2,
				left: rect.left - gap,
				transform: "translate(-100%, -50%)",
			};
		case "right":
			return {
				top: rect.top + rect.height / 2,
				left: rect.left + rect.width + gap,
				transform: "translate(0, -50%)",
			};
		default:
			return {
				top: rect.top - gap,
				left: rect.left + rect.width / 2,
				transform: "translate(-50%, -100%)",
			};
	}
}

/** 贴边时翻到对侧，避免裁切。 */
export function resolveTooltipSide(
	rect: { top: number; left: number; width: number; height: number },
	preferred: TooltipSide,
	viewport = { width: 0, height: 0 },
): TooltipSide {
	const edge = 40;
	if (preferred === "top" && rect.top < edge) {
		return "bottom";
	}
	if (preferred === "bottom" && viewport.height > 0 && viewport.height - (rect.top + rect.height) < edge) {
		return "top";
	}
	if (preferred === "left" && rect.left < 80) {
		return "right";
	}
	if (preferred === "right" && viewport.width > 0 && viewport.width - (rect.left + rect.width) < 80) {
		return "left";
	}
	return preferred;
}

export function parseTooltipSide(value: string | null): TooltipSide {
	if (value === "bottom" || value === "left" || value === "right" || value === "top") {
		return value;
	}
	return "top";
}
