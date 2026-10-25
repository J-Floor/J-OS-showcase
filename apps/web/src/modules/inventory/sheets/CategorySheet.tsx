import { Button, Sheet, createSaveTracker } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { SheetNavState } from "../../../lib/createSheetNav.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createEntityDraft } from "../../../shared/entity/entityCommands.ts";
import { EntitySheetHeader } from "../../../shared/entity/EntitySheetHeader.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";
import type { Category, CategoryPatch } from "../data/inventoryData.ts";
import {
	useCategoryActions,
	useItemTypesByCategory,
} from "../data/inventoryData.ts";
import { categoryFields } from "../fields.ts";

import { FieldsPlaceholder } from "./FieldsPlaceholder.tsx";
import { createInventoryCommands } from "./inventoryCommands.ts";
import { DescriptionValue, NameField } from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";

type CategorySheetProps = SheetOpenProps & {
	category?: Category;
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `category` (which is undefined in both states). */
	loading?: boolean;
	nav?: SheetNavState;
};

/** The category's fields (saved as they are typed) and the actions that
 *  create and delete it. */
function createCategoryForm(props: CategorySheetProps) {
	const actions = useCategoryActions();
	const confirm = useConfirm();

	function key() {
		return `${String(props.open)}:${props.category?._id ?? "new"}`;
	}

	const commands = createInventoryCommands<
		Parameters<typeof actions.create>[0],
		Id<"itemCategories">,
		CategoryPatch
	>({
		actions,
		id: () => props.category?._id,
		onClose: () => {
			draft.onOpenChange(false);
		},
	});

	const { patch } = commands;
	const saves = createSaveTracker();
	const sync = { key, open: () => props.open, tracker: saves };

	const name = createSyncedField({
		remote: () => props.category?.name ?? "",
		...sync,
		write: (value) => patch({ name: value }),
	});
	const description = createSyncedField({
		remote: () => props.category?.description ?? "",
		...sync,
		write: (value) =>
			patch({ description: value.trim() === "" ? null : value }),
	});

	const draft = createEntityDraft(
		props,
		() => props.category !== undefined,
		{
			name,
			description,
		},
		"new category"
	);

	return {
		name,
		description,
		/** Spread onto the `Sheet.Root`. */
		sheet: {
			...draft.sheet,
			saveTracker: saves,
			/** Forwards the sheet's open state, dropping a stale error on
			 *  close. */
			onOpenChange: (isOpen: boolean) => {
				if (!isOpen) commands.failure.clear();
				draft.onOpenChange(isOpen);
			},
		},
		formError: commands.failure.error,
		async createCategory() {
			if (!name.value().trim()) return;
			await commands.create({
				name: name.value(),
				description: description.value().trim() || undefined,
			});
		},
		async deleteCategory() {
			if (!props.category) return;
			const isOk = await confirm({
				title: "Delete this category?",
				message:
					"This can't be undone. Item types that still use it will block the delete.",
				confirmLabel: "Delete",
				tone: "danger",
			});
			if (!isOk) return;
			await commands.remove(props.category._id);
		},
	};
}

export function CategorySheet(props: CategorySheetProps): JSX.Element {
	const form = createCategoryForm(props);
	// Controlled + onValueChange so the section actually collapses (matches
	// the events attendees accordion). A bare `value` with no setter pins it
	// open. Starts open since it's the only section in this accordion.
	const [openTypesSection, setOpenTypesSection] = createSignal<string[]>([
		"types",
	]);

	function isEdit() {
		return props.category !== undefined;
	}

	// Subscribes only while the sheet is open AND an existing (saved)
	// category is selected — closed or create-mode passes `undefined`, which
	// `useItemTypesByCategory` treats as "don't subscribe".
	const typesQuery = useItemTypesByCategory(() =>
		props.open && props.category ? props.category._id : undefined
	);

	let nameElement: HTMLInputElement | undefined;

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			morphId={props.category?._id}
			{...form.sheet}
			initialFocusEl={() => nameElement ?? null}
		>
			<EntitySheetHeader.Root
				title={props.category?.name ?? "New category"}
				loading={props.loading}
				nav={props.nav}
				saveStatus={isEdit() && !props.loading}
			>
				<Show when={isEdit()}>
					<EntitySheetHeader.Delete
						label="Delete category"
						onDelete={() => void form.deleteCategory()}
					/>
				</Show>
			</EntitySheetHeader.Root>
			<Sheet.Skeleton>
				<FieldsPlaceholder
					fields={[categoryFields.name, categoryFields.description]}
				/>
			</Sheet.Skeleton>
			<Sheet.Body loading={props.loading}>
				<NameField
					form={form}
					ref={(element) => {
						nameElement = element;
					}}
				/>
				<DescriptionValue
					field={categoryFields.description}
					description={form.description}
				/>
				<InlineError message={form.formError()} />
				<Show when={isEdit()}>
					<RelatedListSection
						value="types"
						title="Item types"
						emptyText="No item types yet"
						rows={() => typesQuery.data()}
						label={(row) => row.name}
						openSection={openTypesSection}
						onOpenSectionChange={setOpenTypesSection}
					/>
				</Show>
			</Sheet.Body>
			<Show when={!props.loading && !isEdit()}>
				<Sheet.Footer>
					<Button
						disabled={!form.name.value().trim()}
						disabledReason="Add a name first"
						onClick={() => {
							void form.createCategory();
						}}
					>
						Create category
					</Button>
				</Sheet.Footer>
			</Show>
		</Sheet.Root>
	);
}
