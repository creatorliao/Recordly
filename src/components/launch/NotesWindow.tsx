import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { NotesToolbar } from "./NotesToolbar";
import {
	clampNotesFontSize,
	clampTeleprompterSpeed,
	getMaxScrollTop,
	getNextTeleprompterScrollTop,
	getTeleprompterFrame,
	isAtTeleprompterEnd,
	loadInitialNotesContent,
	loadNotesTeleprompterSettings,
	NOTES_FONT_SIZE_STEP,
	resolveTeleprompterPosition,
	saveNotesContent,
	saveNotesTeleprompterSettings,
	TELEPROMPTER_SPEED_STEP,
} from "./notesTeleprompter";
import "./NotesWindow.css";

/**
 * 独立笔记窗：讲稿 + 提词滚动。不进时间轴、不成片。
 * 播放或镜像时锁编辑，避免光标把滚动顶回去、镜像下点选错位。
 */
export function NotesWindow() {
	const t = useScopedT("launch");
	const [settings, setSettings] = useState(loadNotesTeleprompterSettings);
	const [isPlaying, setIsPlaying] = useState(false);
	const [initialContent] = useState(loadInitialNotesContent);

	const editingLocked = isPlaying || settings.mirrored;

	useEffect(() => {
		document.title = t("tooltips.openNotes", "打开笔记");
	}, [t]);

	const editor = useEditor({
		extensions: [StarterKit],
		content: initialContent,
		autofocus: "end",
		// 恢复镜像时第一帧就要锁编辑，等 effect 会闪一帧可写。
		editable: !editingLocked,
		editorProps: {
			attributes: {
				class: "tiptap",
			},
		},
		onUpdate: ({ editor: nextEditor }) => {
			saveNotesContent(nextEditor.getHTML());
		},
	});

	const loadedSettingsRef = useRef(settings);
	useEffect(() => {
		if (settings === loadedSettingsRef.current) {
			return;
		}

		saveNotesTeleprompterSettings(settings);
	}, [settings]);

	useEffect(() => {
		editor?.setEditable(!editingLocked, false);
	}, [editor, editingLocked]);

	useEffect(() => {
		if (!isPlaying || !editor) {
			return;
		}

		const scrollElement = editor.view.dom;

		if (isAtTeleprompterEnd(scrollElement.scrollTop, getMaxScrollTop(scrollElement))) {
			scrollElement.scrollTop = 0;
		}

		let frameId: number | null = null;
		let previousTimestamp: number | null = null;
		let position = scrollElement.scrollTop;

		const tick = (timestamp: number) => {
			const frame = getTeleprompterFrame(previousTimestamp, timestamp);
			previousTimestamp = frame.nextTimestamp;

			if (frame.elapsedMs > 0) {
				const maximumScrollTop = getMaxScrollTop(scrollElement);
				position = getNextTeleprompterScrollTop(
					resolveTeleprompterPosition(position, scrollElement.scrollTop),
					settings.speed,
					frame.elapsedMs,
					maximumScrollTop,
				);

				if (isAtTeleprompterEnd(position, maximumScrollTop)) {
					scrollElement.scrollTop = maximumScrollTop;
					setIsPlaying(false);
					return;
				}

				scrollElement.scrollTop = position;
			}

			frameId = requestAnimationFrame(tick);
		};

		frameId = requestAnimationFrame(tick);
		return () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
		};
	}, [editor, isPlaying, settings.speed]);

	const changeSpeed = useCallback((delta: number) => {
		setSettings((current) => ({
			...current,
			speed: clampTeleprompterSpeed(current.speed + delta),
		}));
	}, []);

	const changeFontSize = useCallback((delta: number) => {
		setSettings((current) => ({
			...current,
			fontSize: clampNotesFontSize(current.fontSize + delta),
		}));
	}, []);

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden bg-white px-6 pb-4 pt-3 gap-4">
			<div className="flex min-w-0 shrink-0 justify-center">
				<NotesToolbar
					editor={editor}
					isPlaying={isPlaying}
					formattingDisabled={editingLocked}
					speed={settings.speed}
					fontSize={settings.fontSize}
					mirrored={settings.mirrored}
					onTogglePlaying={() => setIsPlaying((current) => !current)}
					onDecreaseSpeed={() => changeSpeed(-TELEPROMPTER_SPEED_STEP)}
					onIncreaseSpeed={() => changeSpeed(TELEPROMPTER_SPEED_STEP)}
					onDecreaseFontSize={() => changeFontSize(-NOTES_FONT_SIZE_STEP)}
					onIncreaseFontSize={() => changeFontSize(NOTES_FONT_SIZE_STEP)}
					onToggleMirror={() =>
						setSettings((current) => ({ ...current, mirrored: !current.mirrored }))
					}
				/>
			</div>

			<EditorContent
				editor={editor}
				data-testid="notes-teleprompter-content"
				data-mirrored={settings.mirrored}
				className="notes-teleprompter-content min-h-0 flex-1"
				style={{ fontSize: `${settings.fontSize}px` }}
			/>
		</div>
	);
}
