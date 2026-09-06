import { describe, expect, it } from "vitest";
import { computeTooltipStyle, parseTooltipSide, resolveTooltipSide } from "./tooltip";

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
});
