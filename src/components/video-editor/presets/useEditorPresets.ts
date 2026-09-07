import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import {
	type EditorPreset,
	type EditorPresetSnapshot,
	pickStyleLook,
	saveEditorPresets,
	serializeStyleLook,
} from "../editorPreferences";

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseEditorPresetsParams {
	t: Translator;
	currentSnapshot: EditorPresetSnapshot;
	applySnapshot: (snapshot: EditorPresetSnapshot) => void;
	editorPresets: EditorPreset[];
	setEditorPresets: Dispatch<SetStateAction<EditorPreset[]>>;
	activePresetId: string | null;
	setActivePresetId: Dispatch<SetStateAction<string | null>>;
	presetPopoverOpen: boolean;
	presetNameDraft: string;
	setPresetNameDraft: Dispatch<SetStateAction<string>>;
}

export function useEditorPresets({
	t,
	currentSnapshot,
	applySnapshot,
	editorPresets,
	setEditorPresets,
	activePresetId,
	setActivePresetId,
	presetPopoverOpen,
	presetNameDraft,
	setPresetNameDraft,
}: UseEditorPresetsParams) {
	const currentSignature = useMemo(
		() => serializeStyleLook(pickStyleLook(currentSnapshot)),
		[currentSnapshot],
	);
	const currentEditorPreset = useMemo(
		() => editorPresets.find((preset) => preset.id === activePresetId) ?? null,
		[activePresetId, editorPresets],
	);

	const [revertSlot, setRevertSlot] = useState<{
		look: EditorPresetSnapshot;
		previousActiveId: string | null;
	} | null>(null);
	const isActivePresetDirty = Boolean(
		currentEditorPreset &&
			serializeStyleLook(pickStyleLook(currentEditorPreset.snapshot)) !== currentSignature,
	);
	const matchingUnusedHintName = useMemo(() => {
		if (activePresetId !== null) return null;
		const matches = editorPresets.filter(
			(preset) => serializeStyleLook(pickStyleLook(preset.snapshot)) === currentSignature,
		);
		return matches.length === 1 ? matches[0].name : null;
	}, [activePresetId, currentSignature, editorPresets]);

	useEffect(() => {
		if (!presetPopoverOpen) setPresetNameDraft("");
	}, [presetPopoverOpen, setPresetNameDraft]);

	const handleApplyEditorPreset = useCallback(
		(presetId: string) => {
			const preset = editorPresets.find((item) => item.id === presetId);
			if (!preset) return;
			if (preset.id === activePresetId && !isActivePresetDirty) return;
			setRevertSlot({ look: currentSnapshot, previousActiveId: activePresetId });
			setActivePresetId(preset.id);
			applySnapshot(preset.snapshot);
			toast.success(
				t("editor.presets.toasts.applied", 'Applied preset "{{name}}"', {
					name: preset.name,
				}),
			);
		},
		[
			activePresetId,
			applySnapshot,
			currentSnapshot,
			editorPresets,
			isActivePresetDirty,
			setActivePresetId,
			t,
		],
	);
	const handleCancelApply = useCallback(() => setActivePresetId(null), [setActivePresetId]);
	const handleRevertLastApply = useCallback(() => {
		if (!revertSlot) return;
		applySnapshot(revertSlot.look);
		setActivePresetId(revertSlot.previousActiveId);
		setRevertSlot(null);
	}, [applySnapshot, revertSlot, setActivePresetId]);

	const handleSaveEditorPreset = useCallback(
		(name: string) => {
			const normalizedName = name.trim().replace(/\s+/g, " ");
			if (!normalizedName) {
				toast.error(t("editor.presets.errors.nameRequired", "Enter a preset name."));
				return false;
			}
			if (
				editorPresets.some(
					(preset) =>
						preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
				)
			) {
				toast.error(
					t(
						"editor.presets.errors.duplicateName",
						"A preset with that name already exists.",
					),
				);
				return false;
			}

			const timestamp = new Date().toISOString();
			const nextPreset: EditorPreset = {
				id: crypto.randomUUID(),
				name: normalizedName,
				createdAt: timestamp,
				updatedAt: timestamp,
				snapshot: currentSnapshot,
			};
			const nextPresets = [nextPreset, ...editorPresets];
			if (!saveEditorPresets(nextPresets)) {
				toast.error(
					t(
						"editor.presets.errors.saveFailed",
						"Could not save that preset. Check your browser storage settings and try again.",
					),
				);
				return false;
			}
			setEditorPresets(nextPresets);
			setActivePresetId(nextPreset.id);
			setRevertSlot(null);
			toast.success(
				t("editor.presets.toasts.saved", 'Saved preset "{{name}}"', {
					name: normalizedName,
				}),
			);
			return true;
		},
		[currentSnapshot, editorPresets, setActivePresetId, setEditorPresets, t],
	);
	const handleUpdateActivePreset = useCallback(() => {
		if (!currentEditorPreset) return false;
		const nextPresets = editorPresets.map((preset) =>
			preset.id === currentEditorPreset.id
				? {
						...preset,
						snapshot: { ...preset.snapshot, ...pickStyleLook(currentSnapshot) },
						updatedAt: new Date().toISOString(),
					}
				: preset,
		);
		if (!saveEditorPresets(nextPresets)) return false;
		setEditorPresets(nextPresets);
		setRevertSlot(null);
		toast.success(
			t("editor.presets.toasts.updated", 'Updated style "{{name}}"', {
				name: currentEditorPreset.name,
			}),
		);
		return true;
	}, [currentEditorPreset, currentSnapshot, editorPresets, setEditorPresets, t]);
	const handleRenameEditorPreset = useCallback(
		(presetId: string, name: string) => {
			const normalizedName = name.trim().replace(/\s+/g, " ").slice(0, 40);
			const existing = editorPresets.find((preset) => preset.id === presetId);
			if (!existing || !normalizedName) return false;
			if (
				editorPresets.some(
					(preset) =>
						preset.id !== presetId &&
						preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
				)
			) {
				toast.error(
					t(
						"editor.presets.errors.duplicateName",
						"A preset with that name already exists.",
					),
				);
				return false;
			}
			const next = editorPresets.map((preset) =>
				preset.id === presetId
					? { ...preset, name: normalizedName, updatedAt: new Date().toISOString() }
					: preset,
			);
			if (!saveEditorPresets(next)) return false;
			setEditorPresets(next);
			return true;
		},
		[editorPresets, setEditorPresets, t],
	);

	const handleDeleteEditorPreset = useCallback(
		(presetId: string) => {
			const preset = editorPresets.find((item) => item.id === presetId);
			if (!preset) return;
			const nextPresets = editorPresets.filter((item) => item.id !== presetId);
			if (!saveEditorPresets(nextPresets)) {
				toast.error(
					t(
						"editor.presets.errors.deleteFailed",
						"Could not delete that preset. Check your browser storage settings and try again.",
					),
				);
				return;
			}
			setEditorPresets(nextPresets);
			if (preset.id === activePresetId) setActivePresetId(null);
			toast.success(
				t("editor.presets.toasts.deleted", 'Deleted preset "{{name}}"', {
					name: preset.name,
				}),
			);
		},
		[activePresetId, editorPresets, setActivePresetId, setEditorPresets, t],
	);

	const handleSavePresetSubmit = useCallback(() => {
		if (handleSaveEditorPreset(presetNameDraft)) setPresetNameDraft("");
	}, [handleSaveEditorPreset, presetNameDraft, setPresetNameDraft]);

	return {
		currentEditorPreset,
		isActivePresetDirty,
		matchingUnusedHintName,
		canRevertLastApply: Boolean(revertSlot),
		revertSlot,
		handleApplyEditorPreset,
		handleCancelApply,
		handleRevertLastApply,
		handleUpdateActivePreset,
		handleRenameEditorPreset,
		handleDeleteEditorPreset,
		handleSavePresetSubmit,
	};
}
