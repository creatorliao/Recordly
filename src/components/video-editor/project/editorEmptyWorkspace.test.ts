import { describe, expect, it } from "vitest";
import { shouldLoadEmptyEditorWorkspace } from "./editorEmptyWorkspace";

describe("shouldLoadEmptyEditorWorkspace", () => {
	it("没有当前课、没有会话、没有视频时进空项目", () => {
		expect(
			shouldLoadEmptyEditorWorkspace({
				hasLoadedProject: false,
				hasSessionVideo: false,
				hasCurrentVideo: false,
			}),
		).toBe(true);
	});

	it("已装上项目时不进空项目", () => {
		expect(
			shouldLoadEmptyEditorWorkspace({
				hasLoadedProject: true,
				hasSessionVideo: false,
				hasCurrentVideo: false,
			}),
		).toBe(false);
	});

	it("刚录完、会话里有成片时不进空项目", () => {
		expect(
			shouldLoadEmptyEditorWorkspace({
				hasLoadedProject: false,
				hasSessionVideo: true,
				hasCurrentVideo: false,
			}),
		).toBe(false);
	});

	it("主进程还记着当前视频时不进空项目", () => {
		expect(
			shouldLoadEmptyEditorWorkspace({
				hasLoadedProject: false,
				hasSessionVideo: false,
				hasCurrentVideo: true,
			}),
		).toBe(false);
	});
});
