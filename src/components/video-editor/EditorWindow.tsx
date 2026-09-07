import { useEffect } from "react";
import { ShortcutsProvider } from "../../contexts/ShortcutsContext";
import { loadAllCustomFonts } from "../../lib/customFonts";
import { AnnouncementDialog } from "../announcements/AnnouncementDialog";
import { LiveAnnouncementNotifications } from "../announcements/LiveAnnouncementNotifications";
import { ShortcutsConfigDialog } from "./ShortcutsConfigDialog";
import VideoEditor from "./VideoEditor";
import "./editorTheme.css";

export default function EditorWindow() {
	useEffect(() => {
		loadAllCustomFonts().catch((error) => {
			console.error("Failed to load custom fonts:", error);
		});
	}, []);

	return (
		<>
			<ShortcutsProvider>
				<div className="editor-root h-full min-h-0">
					<VideoEditor />
				</div>
				<ShortcutsConfigDialog />
			</ShortcutsProvider>
			<AnnouncementDialog audience="editor" />
			<LiveAnnouncementNotifications audience="editor" />
		</>
	);
}
