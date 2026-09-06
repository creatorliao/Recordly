import { lazy, Suspense, useEffect, useState } from "react";
import { useI18n } from "./contexts/I18nContext";

const HudWindow = lazy(() => import("./components/launch/HudWindow"));
const SourceSelector = lazy(() =>
	import("./components/launch/SourceSelector").then((module) => ({
		default: module.SourceSelector,
	})),
);
const CountdownOverlay = lazy(() =>
	import("./components/countdown/CountdownOverlay").then((module) => ({
		default: module.CountdownOverlay,
	})),
);
const EditorWindow = lazy(() => import("./components/video-editor/EditorWindow"));
const NotesWindow = lazy(() =>
	import("./components/launch/NotesWindow").then((module) => ({
		default: module.NotesWindow,
	})),
);

export default function App() {
	const [windowType] = useState(
		() => new URLSearchParams(window.location.search).get("windowType") || "",
	);
	const showNotes = new URLSearchParams(window.location.search).get("showNotes") === "true";
	const { t } = useI18n();
	const [appVersion, setAppVersion] = useState<string | null>(null);
	const appIconSrc = "/app-icons/recordly-128.png";

	useEffect(() => {
		document.documentElement.dataset.windowType = windowType;

		if (
			windowType === "hud-overlay" ||
			windowType === "source-selector" ||
			windowType === "countdown"
		) {
			document.body.style.background = "transparent";
			document.documentElement.style.background = "transparent";
			document.getElementById("root")?.style.setProperty("background", "transparent");
		}

		if (windowType === "hud-overlay") {
			document.documentElement.classList.add("hud-overlay-window");
			document.body.classList.add("hud-overlay-window");
			document.getElementById("root")?.classList.add("hud-overlay-window");
			window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
		}
	}, [windowType]);

	useEffect(() => {
		void window.electronAPI
			?.getAppVersion?.()
			.then((version) => setAppVersion(version))
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		if (showNotes) {
			return;
		}
		const baseTitle =
			windowType === "editor"
				? t("app.editorTitle", "Recordly Editor")
				: t("app.name", "Recordly");
		document.title =
			windowType === "editor" && appVersion ? `${baseTitle} ${appVersion}` : baseTitle;
	}, [windowType, t, appVersion, showNotes]);

	let content;
	if (showNotes) {
		content = <NotesWindow />;
	} else {
		switch (windowType) {
			case "hud-overlay":
				content = <HudWindow />;
				break;
			case "source-selector":
				content = <SourceSelector />;
				break;
			case "countdown":
				content = <CountdownOverlay />;
				break;
			case "editor":
				content = <EditorWindow />;
				break;
			default:
				content = (
					<div className="flex h-full w-full items-center justify-center bg-editor-bg text-foreground">
						<div className="flex items-center gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 px-6 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
							<img
								src={appIconSrc}
								alt={t("app.name", "Recordly")}
								className="h-12 w-12 rounded-xl"
							/>
							<div>
								<h1 className="text-xl font-semibold tracking-tight">
									{t("app.name", "Recordly")}
								</h1>
								<p className="text-sm text-foreground/65">
									{t("app.subtitle", "Screen recording and editing")}
								</p>
							</div>
						</div>
					</div>
				);
		}
	}

	return <Suspense fallback={null}>{content}</Suspense>;
}
