import {
	PropertyRow,
	Sheet,
	createSaveTracker,
	type SaveTracker,
} from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { SheetNavState } from "../../../lib/createSheetNav.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import type { SaveWrite } from "../../../lib/reportSave.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { OptionSelect } from "../../../shared/components/OptionSelect.tsx";
import type { ConfirmOptions } from "../../../shared/confirm.tsx";
import { createEntityDraft } from "../../../shared/entity/entityCommands.ts";
import { SheetCreateFooter } from "../../../shared/entity/SheetCreateFooter.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";
import type { ItemType, ItemTypePatch } from "../data/inventoryData.ts";
import {
	useCategories,
	useItemsByType,
	useItemTypeActions,
} from "../data/inventoryData.ts";
import { itemTypeFields } from "../fields.ts";

import { createInventoryCommands } from "./inventoryCommands.ts";
import { NameField } from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";
import {
	createInventorySheetActions,
	InventorySheetHeader,
} from "./SheetHeaderActions.tsx";

const DELETE_ITEM_TYPE_CONFIRM: ConfirmOptions = {
	title: "Delete this item type?",
	message:
		"This can't be undone. Items that still use it will block the delete.",
	confirmLabel: "Delete",
	tone: "danger",
};

type ItemTypeSheetProps = SheetOpenProps & {
	itemType?: ItemType;
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `itemType` (which is undefined in both states). */
	loading?: boolean;
	nav?: SheetNavState;
};

/** The item type's three fields, each saved as it is typed. */
function createItemTypeFields(
	props: ItemTypeSheetProps,
	patch: (change: ItemTypePatch) => ReturnType<SaveWrite>,
	tracker: SaveTracker
) {
	function key() {
		return `${String(props.open)}:${props.itemType?._id ?? "new"}`;
	}
	const sync = { key, open: () => props.open, tracker };

	const name = createSyncedField({
		remote: () => props.itemType?.name ?? "",
		...sync,
		write: (value) => patch({ name: value }),
	});
	const categoryId = createSyncedField<Id<"itemCategories"> | undefined>({
		remote: () => props.itemType?.categoryId,
		...sync,
		write: (value) => (value ? patch({ categoryId: value }) : undefined),
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.itemType?.description ?? "",
		...sync,
		write: (value) =>
			patch({ description: value.trim() === "" ? null : value }),
	});
	return { name, categoryId, description };
}

/** The item type's fields and the actions that create and delete it. */
function createItemTypeForm(props: ItemTypeSheetProps) {
	const actions = useItemTypeActions();

	const commands = createInventoryCommands<
		Parameters<typeof actions.create>[0],
		Id<"itemTypes">,
		ItemTypePatch
	>({
		actions,
		id: () => props.itemType?._id,
		onClose: () => {
			draft.onOpenChange(false);
		},
	});

	const saves = createSaveTracker();
	const fields = createItemTypeFields(props, commands.patch, saves);
	const draft = createEntityDraft(
		props,
		() => props.itemType !== undefined,
		fields,
		"new item type"
	);

	return {
		...fields,
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
		async createItemType() {
			const selected = fields.categoryId.value();
			if (!fields.name.value().trim() || selected === undefined) return;
			await commands.create({
				name: fields.name.value(),
				categoryId: selected,
				description: fields.description.value().trim() || undefined,
			});
		},
		/** Deletes the open row (asked first, by its Delete). */
		remove: commands.remove,
	};
}

/** The open type's items. Subscribes only while the sheet is open AND an
 *  existing (saved) type is selected: closed or create-mode passes
 *  `undefined`, which `useItemsByType` treats as "don't subscribe". */
function useOpenTypeItems(props: ItemTypeSheetProps) {
	return useItemsByType(() =>
		props.open && props.itemType ? props.itemType._id : undefined
	);
}

/** The type's category picker. */
function CategoryRow(props: {
	categoryId: ReturnType<typeof createItemTypeForm>["categoryId"];
	/** The category's name, shown in place of the picker while locked. */
	lockedLabel?: string;
	locked: boolean;
}): JSX.Element {
	const categories = useCategories();
	return (
		<PropertyRow field={itemTypeFields.categoryName}>
			<Show
				when={!props.locked}
				fallback={<span>{props.lockedLabel}</span>}
			>
				<OptionSelect
					label={itemTypeFields.categoryName.label}
					labelHidden
					placeholder="Choose a category"
					options={(categories.data() ?? []).map((category) => ({
						value: category._id,
						label: category.name,
					}))}
					value={props.categoryId.value()}
					onChange={(value) => {
						props.categoryId.set(value);
					}}
				/>
			</Show>
		</PropertyRow>
	);
}

/** The sheet's actions: Delete and the edit lock on a type, Create on the
 *  form. */
function createItemTypeActions(
	props: ItemTypeSheetProps,
	form: ReturnType<typeof createItemTypeForm>
) {
	return createInventorySheetActions({
		scope: "item-type-sheet",
		noun: "item type",
		confirm: DELETE_ITEM_TYPE_CONFIRM,
		isOpen: () => props.open,
		isLoading: () => props.loading,
		row: () => props.itemType,
		remove: form.remove,
		error: form.formError,
		create: {
			can: () =>
				form.name.value().trim() !== "" &&
				form.categoryId.value() !== undefined,
			disabledReason: () => "Add a name and category first",
			run: () => form.createItemType(),
		},
	});
}

export function ItemTypeSheet(props: ItemTypeSheetProps): JSX.Element {
	const form = createItemTypeForm(props);
	// Controlled + onValueChange so the section actually collapses (matches
	// the events attendees accordion). A bare `value` with no setter pins it
	// open. Starts open since it's the only section in this accordion.
	const [openItemsSection, setOpenItemsSection] = createSignal<string[]>([
		"items",
	]);

	function isEdit() {
		return props.itemType !== undefined;
	}

	const itemsQuery = useOpenTypeItems(props);
	const actions = createItemTypeActions(props, form);

	let nameElement: HTMLInputElement | undefined;

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			morphId={props.itemType?._id}
			{...form.sheet}
			initialFocusEl={() => nameElement ?? null}
		>
			<InventorySheetHeader
				title={props.itemType?.name ?? "New item type"}
				loading={props.loading}
				nav={props.nav}
				actions={actions}
				isOpen={props.open}
				placeholderFields={[
					itemTypeFields.name,
					itemTypeFields.categoryName,
					itemTypeFields.description,
				]}
			/>
			<Sheet.Body loading={props.loading}>
				<NameField
					form={form}
					locked={actions.isLocked()}
					ref={(element) => {
						nameElement = element;
					}}
				/>
				<CategoryRow
					categoryId={form.categoryId}
					locked={actions.isLocked()}
					lockedLabel={props.itemType?.categoryName}
				/>
				<DescriptionField
					field={itemTypeFields.description}
					description={form.description}
					readOnly={actions.isLocked()}
				/>
				<InlineError message={form.formError()} />
				<Show when={isEdit()}>
					<RelatedListSection
						value="items"
						title="Items"
						emptyText="No items yet"
						rows={() => itemsQuery.data()}
						label={(row) => row.assetTag}
						openSection={openItemsSection}
						onOpenSectionChange={setOpenItemsSection}
					/>
				</Show>
			</Sheet.Body>
			<SheetCreateFooter
				create={actions.create}
				isCreating={actions.isCreating()}
			/>
		</Sheet.Root>
	);
}
