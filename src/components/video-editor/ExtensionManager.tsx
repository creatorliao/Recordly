import { PuzzlePiece } from "@phosphor-icons/react";

export default function ExtensionManager() {
	return (
		<div className="editor-drawer flex h-full w-[280px] min-w-[280px] max-w-[280px] flex-col overflow-hidden border-r border-foreground/16 bg-editor-panel">
			<div className="flex h-12 shrink-0 items-center border-b border-foreground/10 px-4">
				<h2 className="text-sm font-semibold text-foreground">Extensions</h2>
			</div>

			<div className="flex flex-1 items-center justify-center p-6">
				<div className="flex max-w-[240px] flex-col items-center text-center">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/[0.04]">
						<PuzzlePiece className="h-6 w-6 text-muted-foreground" />
					</div>
					<h3 className="text-sm font-semibold text-foreground">
						Extensions are no longer available
					</h3>
					<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
						Extension installation and marketplace access have been disabled. This area
						is kept as a placeholder for existing projects and navigation.
					</p>
				</div>
			</div>
		</div>
	);
}
