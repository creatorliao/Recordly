/**
 * HUD 线标：对齐 OpenScreen `HudIcons.tsx` 的自定义 SVG（Claude Design 规格）。
 * 打开编辑器用拍板，不用魔杖（魔杖在两边都表示自动增强）。
 * 录制键：空闲圆点、录中方块。开/关态用同一字形加斜杠，不换第二套图标。
 */
export const ICON_SIZE = 20;

const HUD_SVG_PROPS = {
	width: ICON_SIZE,
	height: ICON_SIZE,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

/** 画出「点了之后会变成」的方向：当前竖条则显示横条示意。 */
export function OrientationIcon({
	vertical,
	className,
}: {
	vertical: boolean;
	className?: string;
}) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			{vertical ? (
				<>
					<rect x="3" y="7" width="18" height="10" rx="3" />
					<path d="M12 7v10" />
				</>
			) : (
				<>
					<rect x="7" y="3" width="10" height="18" rx="3" />
					<path d="M7 12h10" />
				</>
			)}
		</svg>
	);
}

export function SourceIcon({ className }: { className?: string }) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			<rect x="2.5" y="4.5" width="19" height="13" rx="2.2" />
			<path d="M8.5 21h7M12 17.5v3.3" />
		</svg>
	);
}

export function VolumeIcon({ muted, className }: { muted: boolean; className?: string }) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			<path
				d="M10.2 5.6 5.6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.6l4.6 3.4a.6.6 0 0 0 1-.48V6.08a.6.6 0 0 0-1-.48Z"
				fill="currentColor"
				stroke="none"
			/>
			{muted ? (
				<path d="M15.2 9.3 19.4 14.7M19.4 9.3l-4.2 5.4" />
			) : (
				<>
					<path d="M15.5 8.5a5 5 0 0 1 0 7" />
					<path d="M18 6a9 9 0 0 1 0 12" />
				</>
			)}
		</svg>
	);
}

export function MicIcon({ muted, className }: { muted: boolean; className?: string }) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			<rect x="9" y="3" width="6" height="11" rx="3" />
			<path d="M18.5 11a6.5 6.5 0 0 1-13 0" />
			<path d="M12 17.5v3" />
			{muted ? <path d="M4 4l16 16" /> : null}
		</svg>
	);
}

export function CameraIcon({ off, className }: { off: boolean; className?: string }) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			<rect x="3" y="6.5" width="13" height="11" rx="2.4" />
			<path d="M16 10.3 21 7v10l-5-3.3" />
			{off ? <path d="M4 4l16 16" /> : null}
		</svg>
	);
}

/** 空闲红圆；录中/停止为圆角方块。 */
export function RecordGlyph({ recording, className }: { recording: boolean; className?: string }) {
	return (
		<svg
			width={ICON_SIZE}
			height={ICON_SIZE}
			viewBox="0 0 24 24"
			className={className}
			aria-hidden="true"
		>
			{recording ? (
				<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" />
			) : (
				<circle cx="12" cy="12" r="7.5" fill="currentColor" />
			)}
		</svg>
	);
}

/** 拍板：打开编辑器。路径与 OpenScreen `OpenInEditorIcon` 一致。 */
export function OpenInEditorIcon({ className }: { className?: string }) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
			<path d="m6.2 5.3 3.1 5.4" />
			<path d="m12.4 3.4 3.1 5.4" />
			<path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
		</svg>
	);
}

/** 笔记/提词器入口，线宽与其它 HUD 标一致。 */
export function NotesIcon({ className }: { className?: string }) {
	return (
		<svg {...HUD_SVG_PROPS} className={className} aria-hidden="true">
			<path d="M7 4.5h7.2L18.5 9v10.5A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 7 4.5Z" />
			<path d="M14.2 4.5V9h4.3" />
			<path d="M9 12.5h6M9 16h4" />
		</svg>
	);
}
