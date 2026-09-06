import { describe, expect, it } from "vitest";
import { snapshotPreviewVideo } from "./previewPlaybackLog";

describe("snapshotPreviewVideo", () => {
	it("空节点返回 null", () => {
		expect(snapshotPreviewVideo(null)).toBeNull();
	});

	it("抽出 paused / currentTime / readyState，方便和进度钉死对账", () => {
		const video = {
			paused: true,
			ended: false,
			currentTime: 0,
			duration: 13.2,
			readyState: 4,
			networkState: 1,
			playbackRate: 1,
			muted: false,
			volume: 1,
			error: null,
		} as unknown as HTMLVideoElement;

		expect(snapshotPreviewVideo(video)).toMatchObject({
			paused: true,
			currentTime: 0,
			duration: 13.2,
			readyState: 4,
			errorCode: null,
		});
	});
});
