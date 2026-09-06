import { FolderOpen } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";
import { toFileUrl } from "../projectPersistence";

type Props = {
	entries: ProjectLibraryEntry[];
	onOpenProject: (projectPath: string) => void;
	onImportFile: () => void;
};

export function ProjectsPanel({ entries, onOpenProject, onImportFile }: Props) {
	const { t } = useI18n();
	const visibleEntries = useMemo(() => entries.slice(0, 24), [entries]);

	return (
		<div className="flex h-full w-[300px] shrink-0 flex-col border-r border-foreground/10 bg-editor-panel/40">
			<div className="flex items-center justify-between gap-2 border-b border-foreground/10 px-3 py-2">
				<div className="text-sm font-medium tracking-tight text-foreground">
					{t("editor.project.browserTitle", "Projects")}
				</div>
				<button
					type="button"
					onClick={onImportFile}
					className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground/70 transition hover:bg-foreground/10 hover:text-foreground"
				>
					<FolderOpen className="h-3.5 w-3.5" />
					{t("editor.project.import", "Import")}
				</button>
			</div>
			<div className="flex-1 overflow-y-auto px-2.5 py-2.5">
				{visibleEntries.length > 0 ? (
					<div className="grid grid-cols-2 gap-2">
						{visibleEntries.map((entry) => {
							const thumbnailSrc = entry.thumbnailPath
								? toFileUrl(entry.thumbnailPath)
								: null;
							return (
								<button
									key={entry.path}
									type="button"
									onClick={() => onOpenProject(entry.path)}
									className="group flex flex-col gap-1 rounded-lg bg-transparent p-0.5 text-left outline-none transition focus:outline-none"
								>
									<div className="relative aspect-[16/10] w-full overflow-hidden rounded-[5px] bg-editor-dialog-alt shadow-[0_10px_18px_rgba(0,0,0,0.28)] transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_rgba(0,0,0,0.38)]">
										{thumbnailSrc ? (
											<img
												src={thumbnailSrc}
												alt=""
												className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
												draggable={false}
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,_rgba(37,99,235,0.22),_rgba(13,17,23,0.92))] text-[10px] font-medium text-white/60">
												{t("editor.project.noPreview", "No preview yet")}
											</div>
										)}
										{entry.isCurrent ? (
											<div className="absolute right-1.5 top-1.5">
												<span className="rounded-[5px] bg-[#2563EB] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)]">
													{t("editor.project.current", "Current")}
												</span>
											</div>
										) : null}
									</div>
									<div className="flex flex-1 flex-col px-0.5 py-0.5">
										<div className="truncate text-[11px] font-semibold tracking-tight text-foreground">
											{entry.name}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				) : (
					<div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-foreground/10 bg-editor-bg px-4 text-center">
						<div className="text-sm font-semibold text-foreground">
							{t("editor.project.emptyLibrary", "No saved projects yet")}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
