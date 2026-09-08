export const TIMELINE_AXIS_HEIGHT_PX = 28;
export const TIMELINE_ROW_MIN_HEIGHT_PX = 24;
export const TIMELINE_VISIBLE_ROW_COUNT = 2;
export const TIMELINE_CANVAS_PAD_X_PX = 8;
/** 标尺右侧折叠槽。钮待在槽里，不叠最后一刻度。 */
export const TIMELINE_COLLAPSE_SLOT_PX = 24;

function normalizeRowCount(rowCount: number) {
	if (!Number.isFinite(rowCount)) {
		return 0;
	}

	return Math.max(0, Math.floor(rowCount));
}

export function getTimelineRowsMinHeightPx(rowCount: number) {
	return normalizeRowCount(rowCount) * TIMELINE_ROW_MIN_HEIGHT_PX;
}

export function getTimelineContentMinHeightPx(rowCount: number) {
	return TIMELINE_AXIS_HEIGHT_PX + getTimelineRowsMinHeightPx(rowCount);
}

export function getTimelineViewportStretchFactor(_rowCount: number) {
	return 1;
}
