/**
 * 编辑器回放金路径日志：只记能区分「播放被 pause」还是「成片解码走不动」的事件。
 * 经 appLog 落到本次启动的会话 JSONL，便于和 capture.start 的档位对账。
 */
import { appLog } from "@/lib/appLog";

const FIRST_BURST = 12;
const THROTTLE_MS = 2000;
const eventBudget = new Map<string, { count: number; lastLoggedAt: number }>();

export type PreviewPlaybackSnapshot = {
	paused: boolean;
	ended: boolean;
	currentTime: number;
	duration: number | null;
	readyState: number;
	networkState: number;
	playbackRate: number;
	muted: boolean;
	volume: number;
	errorCode: number | null;
};

/** 从隐藏 <video> 抽诊断快照；不写路径，避免刷盘。 */
export function snapshotPreviewVideo(video: HTMLVideoElement | null): PreviewPlaybackSnapshot | null {
	if (!video) {
		return null;
	}
	const duration = Number.isFinite(video.duration) ? video.duration : null;
	const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
	const volume = Number.isFinite(video.volume) ? video.volume : 0;
	const playbackRate = Number.isFinite(video.playbackRate) ? video.playbackRate : 1;
	return {
		paused: Boolean(video.paused),
		ended: Boolean(video.ended),
		currentTime: Number(currentTime.toFixed(3)),
		duration: duration === null ? null : Number(duration.toFixed(3)),
		readyState: video.readyState ?? 0,
		networkState: video.networkState ?? 0,
		playbackRate,
		muted: Boolean(video.muted),
		volume: Number(volume.toFixed(3)),
		errorCode: video.error?.code ?? null,
	};
}

function shouldWrite(event: string): { seq: number } | null {
	const now = Date.now();
	const slot = eventBudget.get(event) ?? { count: 0, lastLoggedAt: 0 };
	slot.count += 1;
	eventBudget.set(event, slot);
	if (slot.count > FIRST_BURST && now - slot.lastLoggedAt < THROTTLE_MS) {
		return null;
	}
	slot.lastLoggedAt = now;
	return { seq: slot.count };
}

/** 写一条 preview.* 事件。同类事件前 12 条全记，之后每 2 秒最多一条，避免 pause 环把日志打爆。 */
export function logPreviewPlayback(
	event: string,
	data: Record<string, unknown> = {},
	level: "info" | "warn" | "error" = "info",
) {
	const budget = shouldWrite(event);
	if (!budget) {
		return;
	}
	appLog({
		level,
		scope: "preview",
		event,
		data: { ...data, seq: budget.seq },
	});
}

/**
 * 点播放后看时钟有没有走。400ms / 1500ms 各记一次：
 * 仍 paused 或 currentTime≈0 → 编辑器按死；paused=false 且时间在走 → 解码至少动了。
 */
export function schedulePreviewProgressChecks(
	getVideo: () => HTMLVideoElement | null,
	tokenRef: { current: number },
) {
	const token = tokenRef.current + 1;
	tokenRef.current = token;
	for (const delayMs of [400, 1500]) {
		window.setTimeout(() => {
			if (tokenRef.current !== token) {
				return;
			}
			const video = getVideo();
			const snap = snapshotPreviewVideo(video);
			if (!snap) {
				logPreviewPlayback("preview.progress-check", { delayMs, missing: true }, "warn");
				return;
			}
			const stuck = snap.paused || snap.currentTime < 0.05;
			logPreviewPlayback(
				"preview.progress-check",
				{ delayMs, stuck, ...snap },
				stuck ? "warn" : "info",
			);
		}, delayMs);
	}
}
