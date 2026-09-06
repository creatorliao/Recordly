/**
 * 笔记提词器纯函数：速度/字号/镜像持久化、滚动帧、手滑接管。
 * 逻辑与 OpenScreen `notesTeleprompter.ts` 对齐；笔记不是旁白轨，不进成片。
 */

export const NOTES_TELEPROMPTER_STORAGE_KEY = "notesTeleprompterSettings";

export const MIN_TELEPROMPTER_SPEED = 10;
export const MAX_TELEPROMPTER_SPEED = 100;
export const TELEPROMPTER_SPEED_STEP = 10;

export const MIN_NOTES_FONT_SIZE = 14;
export const MAX_NOTES_FONT_SIZE = 48;
export const NOTES_FONT_SIZE_STEP = 2;

export const MAX_TELEPROMPTER_FRAME_MS = 100;

/**
 * DOM scrollTop 与跟踪位置允许的偏差。超过则认人手动滚。
 * 也用来判断是否已经滚到底。
 */
export const TELEPROMPTER_SCROLL_TOLERANCE_PX = 1;

export type NotesTeleprompterSettings = {
	speed: number;
	fontSize: number;
	mirrored: boolean;
};

export const DEFAULT_NOTES_TELEPROMPTER_SETTINGS: NotesTeleprompterSettings = {
	speed: 40,
	fontSize: 16,
	mirrored: false,
};

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(maximum, Math.max(minimum, value));
}

export function clampTeleprompterSpeed(value: number): number {
	return clampNumber(
		value,
		DEFAULT_NOTES_TELEPROMPTER_SETTINGS.speed,
		MIN_TELEPROMPTER_SPEED,
		MAX_TELEPROMPTER_SPEED,
	);
}

export function clampNotesFontSize(value: number): number {
	return clampNumber(
		value,
		DEFAULT_NOTES_TELEPROMPTER_SETTINGS.fontSize,
		MIN_NOTES_FONT_SIZE,
		MAX_NOTES_FONT_SIZE,
	);
}

export function normalizeNotesTeleprompterSettings(value: unknown): NotesTeleprompterSettings {
	if (!value || typeof value !== "object") {
		return { ...DEFAULT_NOTES_TELEPROMPTER_SETTINGS };
	}

	const candidate = value as Partial<NotesTeleprompterSettings>;
	return {
		speed: clampTeleprompterSpeed(candidate.speed ?? Number.NaN),
		fontSize: clampNotesFontSize(candidate.fontSize ?? Number.NaN),
		mirrored:
			typeof candidate.mirrored === "boolean"
				? candidate.mirrored
				: DEFAULT_NOTES_TELEPROMPTER_SETTINGS.mirrored,
	};
}

export function loadNotesTeleprompterSettings(
	storage: ReadableStorage = localStorage,
): NotesTeleprompterSettings {
	try {
		const stored = storage.getItem(NOTES_TELEPROMPTER_STORAGE_KEY);
		return stored
			? normalizeNotesTeleprompterSettings(JSON.parse(stored))
			: { ...DEFAULT_NOTES_TELEPROMPTER_SETTINGS };
	} catch {
		return { ...DEFAULT_NOTES_TELEPROMPTER_SETTINGS };
	}
}

export function saveNotesTeleprompterSettings(
	settings: NotesTeleprompterSettings,
	storage: WritableStorage = localStorage,
): boolean {
	try {
		storage.setItem(
			NOTES_TELEPROMPTER_STORAGE_KEY,
			JSON.stringify(normalizeNotesTeleprompterSettings(settings)),
		);
		return true;
	} catch {
		return false;
	}
}

export function loadInitialNotesContent(storage: ReadableStorage = localStorage): string {
	let stored: string | null;
	try {
		stored = storage.getItem("notes");
	} catch {
		return "";
	}

	if (!stored) {
		return "";
	}

	// 旧版纯文本：包一层段落，让 StarterKit 能解析。
	if (!stored.trim().startsWith("<")) {
		const escaped = stored.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		return `<p>${escaped.replace(/\n/g, "</p><p>")}</p>`;
	}

	return stored;
}

export function saveNotesContent(html: string, storage: WritableStorage = localStorage): boolean {
	try {
		storage.setItem("notes", html);
		return true;
	} catch {
		return false;
	}
}

export type TeleprompterFrame = {
	elapsedMs: number;
	nextTimestamp: number | null;
};

export function getTeleprompterFrame(
	previousTimestamp: number | null,
	currentTimestamp: number,
): TeleprompterFrame {
	if (!Number.isFinite(currentTimestamp)) {
		return { elapsedMs: 0, nextTimestamp: null };
	}

	if (
		previousTimestamp === null ||
		!Number.isFinite(previousTimestamp) ||
		currentTimestamp <= previousTimestamp
	) {
		return { elapsedMs: 0, nextTimestamp: currentTimestamp };
	}

	return {
		elapsedMs: Math.min(currentTimestamp - previousTimestamp, MAX_TELEPROMPTER_FRAME_MS),
		nextTimestamp: currentTimestamp,
	};
}

export function getNextTeleprompterScrollTop(
	currentScrollTop: number,
	speed: number,
	elapsedMs: number,
	maxScrollTop: number,
): number {
	const safeCurrent = Number.isFinite(currentScrollTop) ? Math.max(0, currentScrollTop) : 0;
	const safeMaximum = Number.isFinite(maxScrollTop) ? Math.max(0, maxScrollTop) : 0;
	const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
	const distance = (clampTeleprompterSpeed(speed) * safeElapsed) / 1_000;

	return Math.min(safeMaximum, safeCurrent + distance);
}

/**
 * 播放用自己的小数位置，不每帧回读 scrollTop：最慢档一帧约 0.17px，
 * 引擎若取整会把位移吃掉、提词器看起来停住。偏差超过容差则认人手动滚。
 */
export function resolveTeleprompterPosition(
	trackedPosition: number,
	actualScrollTop: number,
): number {
	if (!Number.isFinite(actualScrollTop)) {
		return Number.isFinite(trackedPosition) ? Math.max(0, trackedPosition) : 0;
	}

	if (!Number.isFinite(trackedPosition)) {
		return Math.max(0, actualScrollTop);
	}

	const drift = Math.abs(actualScrollTop - trackedPosition);
	return Math.max(
		0,
		drift > TELEPROMPTER_SCROLL_TOLERANCE_PX ? actualScrollTop : trackedPosition,
	);
}

/** 正文未超出视口时不算到底，播放保持待命，写长了再开始动。 */
export function isAtTeleprompterEnd(scrollTop: number, maxScrollTop: number): boolean {
	if (!Number.isFinite(maxScrollTop) || maxScrollTop <= 0) {
		return false;
	}

	const safeScrollTop = Number.isFinite(scrollTop) ? scrollTop : 0;
	return safeScrollTop >= maxScrollTop - TELEPROMPTER_SCROLL_TOLERANCE_PX;
}

export function getMaxScrollTop(
	element: Pick<HTMLElement, "scrollHeight" | "clientHeight">,
): number {
	return Math.max(0, element.scrollHeight - element.clientHeight);
}
