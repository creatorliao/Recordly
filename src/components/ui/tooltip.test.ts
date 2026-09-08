import { describe, expect, it } from "vitest";
import {
	adoptNativeTitle,
	computeTooltipStyle,
	parseTooltipSide,
	resolveTooltipSide,
} from "./tooltip";

/** 无 jsdom：用轻量假节点测 title → data-tooltip 收成逻辑。 */
function makeFakeEl(attrs: Record<string, string | null> = {}) {
	const store = new Map<string, string>();
	for (const [key, value] of Object.entries(attrs)) {
		if (value !== null) store.set(key, value);
	}
	return {
		getAttribute: (name: string) => store.get(name) ?? null,
		setAttribute: (name: string, value: string) => {
			store.set(name, value);
		},
		removeAttribute: (name: string) => {
			store.delete(name);
		},
		hasAttribute: (name: string) => store.has(name),
	} as unknown as HTMLElement;
}

describe("app tooltip geometry", () => {
	it("top 侧锚在元素上方居中", () => {
		expect(computeTooltipStyle({ top: 100, left: 40, width: 20, height: 20 }, "top")).toEqual({
			top: 92,
			left: 50,
			transform: "translate(-50%, -100%)",
		});
	});

	it("贴顶时翻到下方", () => {
		expect(
			resolveTooltipSide({ top: 8, left: 10, width: 20, height: 20 }, "top", {
				width: 800,
				height: 600,
			}),
		).toBe("bottom");
	});

	it("只接受约定的四个方向", () => {
		expect(parseTooltipSide("right")).toBe("right");
		expect(parseTooltipSide("nope")).toBe("top");
	});

	it("把原生 title 收成 data-tooltip 并摘掉 title", () => {
		const button = makeFakeEl({ title: "展开时间轴" });
		adoptNativeTitle(button);
		expect(button.getAttribute("data-tooltip")).toBe("展开时间轴");
		expect(button.hasAttribute("title")).toBe(false);
	});

	it("已有 data-tooltip 时不覆盖，仍摘掉原生 title", () => {
		const button = makeFakeEl({
			title: "系统提示",
			"data-tooltip": "统一图贴",
		});
		adoptNativeTitle(button);
		expect(button.getAttribute("data-tooltip")).toBe("统一图贴");
		expect(button.hasAttribute("title")).toBe(false);
	});
});
