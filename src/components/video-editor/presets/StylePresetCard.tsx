import { DotsThree, Trash } from "@phosphor-icons/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useVideoEditorPresets } from "./useVideoEditorPresets";

type Props = {
	t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
	presets: ReturnType<typeof useVideoEditorPresets>;
};

export function StylePresetCard({ t, presets }: Props) {
	const [deleteId, setDeleteId] = React.useState<string | null>(null);
	const [renameId, setRenameId] = React.useState<string | null>(null);
	const [renameDraft, setRenameDraft] = React.useState("");
	const deletePreset = presets.editorPresets.find((preset) => preset.id === deleteId);
	const submitRename = () => {
		if (renameId && presets.handleRenameEditorPreset(renameId, renameDraft)) {
			setRenameId(null);
		}
	};
	return (
		<section className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 text-[11px]">
			<h3 className="font-semibold text-foreground">
				{t("editor.presets.label", "Style presets")}
			</h3>
			<p className="mt-1 text-muted-foreground">
				{t(
					"editor.presets.blurb",
					"Saves look: scene, cursor, zoom. Not export, crop, or webcam layout.",
				)}
			</p>
			<div className="mt-3 flex gap-2">
				<input
					maxLength={40}
					value={presets.presetNameDraft}
					onChange={(event) => presets.setPresetNameDraft(event.target.value)}
					placeholder={t(
						"editor.presets.emptyHint",
						"Name the current look to reuse it in the next lesson.",
					)}
					className="min-w-0 flex-1 rounded-md border border-foreground/10 bg-background px-2 py-1.5 outline-none focus:border-[#2563EB]"
				/>
				<Button size="sm" onClick={presets.handleSavePresetSubmit}>
					{presets.activeEditorPresetId && presets.isActivePresetDirty
						? t("editor.presets.saveAs", "Save as")
						: t("common.actions.save", "Save")}
				</Button>
			</div>
			{presets.isActivePresetDirty && presets.currentEditorPreset ? (
				<Button
					variant="outline"
					size="sm"
					className="mt-2 w-full"
					onClick={presets.handleUpdateActivePreset}
				>
					{t("editor.presets.updateNamed", 'Update "{{name}}"', {
						name: presets.currentEditorPreset.name,
					})}
				</Button>
			) : null}
			{presets.canRevertLastApply ? (
				<button
					type="button"
					className="mt-2 text-[#2563EB]"
					onClick={presets.handleRevertLastApply}
				>
					{t("editor.presets.revertLastApply", "Undo last style apply")}
				</button>
			) : null}
			<div className="mt-3 space-y-1">
				<button
					type="button"
					className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${presets.activeEditorPresetId === null ? "bg-[#2563EB]/10" : "hover:bg-foreground/5"}`}
					onClick={presets.handleCancelApply}
					aria-label={t("editor.presets.unused", "No style preset")}
				>
					<span>{t("editor.presets.unused", "No style preset")}</span>
					<span>{presets.activeEditorPresetId === null ? "✓" : ""}</span>
				</button>
				{presets.matchingUnusedHintName ? (
					<p className="px-2 text-muted-foreground">
						{t(
							"editor.presets.coincidentalMatch",
							'No style preset. The current look happens to match "{{name}}".',
							{ name: presets.matchingUnusedHintName },
						)}
					</p>
				) : null}
				{presets.editorPresets.length === 0 ? (
					<p className="px-2 py-2 text-muted-foreground">
						{t(
							"editor.presets.emptyHint",
							"Name the current look to reuse it in the next lesson.",
						)}
					</p>
				) : null}
				{presets.editorPresets.map((preset) => {
					const isRenaming = renameId === preset.id;
					return (
						<div
							key={preset.id}
							className={`flex items-center gap-1 rounded-md px-2 py-1 ${presets.activeEditorPresetId === preset.id ? "bg-[#2563EB]/10" : "hover:bg-foreground/5"}`}
						>
							{isRenaming ? (
								<input
									autoFocus
									value={renameDraft}
									onChange={(event) => setRenameDraft(event.target.value)}
									onBlur={submitRename}
									onKeyDown={(event) => {
										if (event.key === "Enter") submitRename();
										if (event.key === "Escape") setRenameId(null);
									}}
									className="min-w-0 flex-1 bg-transparent outline-none"
								/>
							) : (
								<button
									type="button"
									className="min-w-0 flex-1 truncate text-left"
									onClick={() => presets.handleApplyEditorPreset(preset.id)}
								>
									{preset.name}
									{presets.activeEditorPresetId === preset.id &&
									presets.isActivePresetDirty
										? " (edited)"
										: ""}
								</button>
							)}
							{presets.activeEditorPresetId === preset.id ? <span>✓</span> : null}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="rounded p-1"
										aria-label={t("editor.presets.more", "More actions")}
									>
										<DotsThree size={16} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onSelect={() => {
											setRenameId(preset.id);
											setRenameDraft(preset.name);
										}}
									>
										{t("editor.presets.rename", "Rename")}
									</DropdownMenuItem>
									{presets.activeEditorPresetId === preset.id ? (
										<DropdownMenuItem onSelect={presets.handleCancelApply}>
											{t("editor.presets.cancelApply", "Stop using preset")}
										</DropdownMenuItem>
									) : null}
									<DropdownMenuItem onSelect={() => setDeleteId(preset.id)}>
										{t("editor.presets.deleteTitle", "Delete style")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				})}
			</div>
			<Dialog
				open={Boolean(deletePreset)}
				onOpenChange={(open) => {
					if (!open) setDeleteId(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("editor.presets.deleteTitle", "Delete style")}</DialogTitle>
						<DialogDescription>
							{t(
								"editor.presets.deleteBody",
								'Delete style "{{name}}"? The current look stays.',
								{ name: deletePreset?.name ?? "" },
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteId(null)}>
							{t("common.actions.cancel", "Cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (deleteId) presets.handleDeleteEditorPreset(deleteId);
								setDeleteId(null);
							}}
						>
							<Trash size={14} />
							{t("common.actions.delete", "Delete")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
