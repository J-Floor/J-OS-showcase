import {
	Accordion,
	Sheet,
	PropertyRow,
	createSaveTracker,
	type SaveTracker,
} from "@j-os/design-system";
import {
	Show,
	createEffect,
	createSignal,
	on,
	type Accessor,
	type JSX,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";
import { ActionButton } from "../../../shared/actions/ActionButton.tsx";
import { CREATE_TARGET } from "../../../shared/actions/shortcuts.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { OptionSelect } from "../../../shared/components/OptionSelect.tsx";
import type { ConfirmOptions } from "../../../shared/confirm.tsx";
import { createSyncedField } from "../../../shared/createSyncedField.ts";
import type { SheetNavState } from "../../../shared/entity/createSheetNav.ts";
import { createEntityDraft } from "../../../shared/entity/entityCommands.ts";
import { EntityQrBlock } from "../../../shared/entity/EntityQr.tsx";
import { SheetCreateFooter } from "../../../shared/entity/SheetCreateFooter.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { SaveWrite } from "../../../shared/reportSave.ts";
import type { SheetOpenProps } from "../../../shared/types.ts";
import type { Item, ItemPatch } from "../data/inventoryData.ts";
import {
	useItemActions,
	useItems,
	useItemTypes,
} from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";
import { itemFields } from "../fields.ts";
import { createCopyFromKeys } from "../inventoryActions.ts";

import { AssetTagInput } from "./AssetTagInput.tsx";
import { detailsFromItem } from "./copyFromItem.ts";
import { CopyFromItemDialog } from "./CopyFromItemDialog.tsx";
import { createInventoryCommands } from "./inventoryCommands.ts";
import {
	createInventorySheetActions,
	InventorySheetHeader,
} from "./SheetHeaderActions.tsx";

const DELETE_ITEM_CONFIRM: ConfirmOptions = {
	title: "Delete this item?",
	message: "This can't be undone.",
	confirmLabel: "Delete",
	tone: "danger",
};

/** The rows the skeleton stands in for: the sheet's own fields. */
const PLACEHOLDER_FIELDS = [
	itemFields.assetTag,
	itemFields.typeName,
	itemFields.description,
];

type ItemSheetProps = SheetOpenProps & {
	item?: Item;
	initialAssetTag?: string;
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `item` (which is undefined in both states). */
	loading?: boolean;
	nav?: SheetNavState;
};

/** The item's three fields, each saved as it is typed (the asset tag is
 *  create-only). */
function createItemFields(
	props: ItemSheetProps,
	patch: (change: ItemPatch) => ReturnType<SaveWrite>,
	tracker: SaveTracker
) {
	function key() {
		return `${String(props.open)}:${props.item?._id ?? "new"}:${props.initialAssetTag ?? ""}`;
	}
	const sync = { key, open: () => props.open, tracker };

	const assetTag = createSyncedField({
		remote: () => props.item?.assetTag ?? props.initialAssetTag ?? "",
		...sync,
		// Create-only field: the tag is read-only text in edit mode (below), so
		// this never fires there — `createItem` sends it once. Autosaving it
		// would rename the slug (`selected()` matches on assetTag) and slam the
		// sheet shut mid-edit, so there is deliberately no write here.
		write: () => {},
	});
	const typeId = createSyncedField<Id<"itemTypes"> | undefined>({
		remote: () => props.item?.typeId,
		...sync,
		write: (value) => (value ? patch({ typeId: value }) : undefined),
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.item?.description ?? "",
		...sync,
		write: (value) =>
			patch({ description: value.trim() === "" ? null : value }),
	});
	return { assetTag, typeId, description };
}

function isAssetTagValid(tag: string): boolean {
	return parseAssetTag(tag).isOk();
}

/** The item's fields and the actions that create and delete it. */
function createItemForm(props: ItemSheetProps) {
	const actions = useItemActions();

	const commands = createInventoryCommands<
		Parameters<typeof actions.create>[0],
		Id<"items">,
		ItemPatch
	>({
		actions,
		id: () => props.item?._id,
		onClose: () => {
			draft.onOpenChange(false);
		},
	});

	const saves = createSaveTracker();
	const fields = createItemFields(props, commands.patch, saves);
	// A scanned tag is where the form starts, not a change.
	const draft = createEntityDraft(
		props,
		() => props.item !== undefined,
		fields,
		"new item"
	);

	function tagLooksValid() {
		return isAssetTagValid(fields.assetTag.value());
	}

	return {
		...fields,
		draft,
		/** Spread onto the `Sheet.Root`, before its own `onOpenChange`. */
		sheet: { ...draft.sheet, saveTracker: saves },
		formError: commands.failure.error,
		clearFormError: commands.failure.clear,
		tagLooksValid,
		/** Fills the type and description from another item. */
		copyFrom: (source: Item): void => {
			const details = detailsFromItem(source);
			fields.typeId.set(details.typeId);
			fields.description.set(details.description);
		},
		async createItem() {
			const selected = fields.typeId.value();
			if (!tagLooksValid() || selected === undefined) return;
			await commands.create({
				typeId: selected,
				assetTag: fields.assetTag.value(),
				description: fields.description.value().trim() || undefined,
			});
		},
		/** Deletes the open row (asked first, by its Delete). */
		remove: commands.remove,
	};
}

type ItemForm = ReturnType<typeof createItemForm>;

/** The create form's copy-from-item button and its dialog. Create-only, so an
 *  edit sheet (or a peek) never subscribes to the whole items list. The button
 *  is disabled while there is nothing to copy; the dialog closes with the
 *  sheet. */
function CopyFromItem(props: {
	isSheetOpen: boolean;
	onCopy: (source: Item) => void;
}) {
	const items = useItems();
	const [copyOpen, setCopyOpen] = createSignal(false);
	const copy = createCopyFromKeys({
		isFormOpen: () => props.isSheetOpen,
		hasItems: () => (items.data() ?? []).length > 0,
		openDialog: () => {
			setCopyOpen(true);
		},
	});
	createEffect(
		on(
			() => props.isSheetOpen,
			(isOpen) => {
				if (!isOpen) setCopyOpen(false);
			}
		)
	);
	return (
		<>
			<ActionButton
				action={copy}
				target={CREATE_TARGET}
				variant="tertiary"
			/>
			<CopyFromItemDialog
				open={copyOpen()}
				onOpenChange={setCopyOpen}
				items={items.data() ?? []}
				onSelect={props.onCopy}
			/>
		</>
	);
}

/** The asset tag: two fields that only take a tag while creating, read-only
 *  text for an existing item (its tag is its slug), unkeyed because the
 *  sheet title already shows it and carries the row's title flight. */
function AssetTagField(props: {
	item?: Item;
	assetTag: ItemForm["assetTag"];
	hasError: boolean;
	onElement: (element: HTMLInputElement) => void;
}) {
	return (
		<Show
			when={props.item === undefined}
			fallback={
				<PropertyRow
					icon={itemFields.assetTag.icon}
					label={itemFields.assetTag.label}
				>
					<span>{props.item!.assetTag}</span>
				</PropertyRow>
			}
		>
			<AssetTagInput
				field={props.assetTag}
				hasError={props.hasError}
				onElement={props.onElement}
			/>
		</Show>
	);
}

/** The item type picker, labelled "name · category". */
function ItemTypeSelect(props: {
	typeId: ItemForm["typeId"];
	/** The type's label, shown in place of the picker while locked. */
	lockedLabel?: string;
	locked: boolean;
}) {
	const types = useItemTypes();
	return (
		<PropertyRow field={itemFields.typeName}>
			<Show
				when={!props.locked}
				fallback={<span>{props.lockedLabel}</span>}
			>
				<OptionSelect
					label={itemFields.typeName.label}
					labelHidden
					placeholder="Choose a type"
					options={(types.data() ?? []).map((itemType) => ({
						value: itemType._id,
						label: `${itemType.name} · ${itemType.categoryName}`,
					}))}
					value={props.typeId.value()}
					onChange={(value) => {
						props.typeId.set(value);
					}}
				/>
			</Show>
		</PropertyRow>
	);
}

/** The item's QR code and link, collapsible. */
function ItemQrSection(props: {
	item: Accessor<Item>;
	openSections: Accessor<string[]>;
	onOpenSectionsChange: (sections: string[]) => void;
}) {
	return (
		<Accordion.Root
			multiple
			value={props.openSections()}
			onValueChange={(details) => {
				props.onOpenSectionsChange(details.value);
			}}
		>
			<Accordion.Item value="qr">
				<Accordion.ItemTitle>QR &amp; link</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<EntityQrBlock {...itemEntity.qr!(props.item())} />
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	);
}

/** The item's own fields: asset tag, type and description, then the last
 *  action's failure. */
function ItemFormFields(props: {
	item?: Item;
	form: ItemForm;
	locked: boolean;
	onTagElement: (element: HTMLInputElement) => void;
}) {
	return (
		<>
			<AssetTagField
				item={props.item}
				assetTag={props.form.assetTag}
				hasError={props.form.formError() !== null}
				onElement={props.onTagElement}
			/>
			<ItemTypeSelect
				typeId={props.form.typeId}
				locked={props.locked}
				lockedLabel={
					props.item &&
					`${props.item.typeName} · ${props.item.categoryName}`
				}
			/>
			<DescriptionField
				field={itemFields.description}
				description={props.form.description}
				readOnly={props.locked}
			/>
			<InlineError message={props.form.formError()} />
		</>
	);
}

export function ItemSheet(props: ItemSheetProps): JSX.Element {
	const form = createItemForm(props);
	// Controlled + onValueChange so the section actually collapses (matches
	// community's PersonDetail). A bare `value` with no setter pins it open.
	const [openSections, setOpenSections] = createSignal(["qr"]);

	function isEdit() {
		return props.item !== undefined;
	}

	const actions = createInventorySheetActions({
		scope: "item-sheet",
		noun: "item",
		confirm: DELETE_ITEM_CONFIRM,
		isOpen: () => props.open,
		isLoading: () => props.loading,
		row: () => props.item,
		remove: form.remove,
		error: form.formError,
		create: {
			can: () =>
				form.tagLooksValid() && form.typeId.value() !== undefined,
			disabledReason: () => "Add a valid asset tag and type first",
			run: () => form.createItem(),
		},
	});

	let tagElement: HTMLInputElement | undefined;

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			morphId={props.item?._id}
			{...form.sheet}
			onOpenChange={(isOpen) => {
				if (!isOpen) form.clearFormError();
				form.draft.onOpenChange(isOpen);
			}}
			initialFocusEl={() => tagElement ?? null}
		>
			<InventorySheetHeader
				title={props.item?.assetTag ?? "New item"}
				loading={props.loading}
				nav={props.nav}
				actions={actions}
				isOpen={props.open}
				placeholderFields={PLACEHOLDER_FIELDS}
			/>
			<Sheet.Body loading={props.loading}>
				<Show when={!isEdit()}>
					<CopyFromItem
						isSheetOpen={props.open && !props.loading}
						onCopy={form.copyFrom}
					/>
				</Show>
				<ItemFormFields
					item={props.item}
					form={form}
					locked={actions.isLocked()}
					onTagElement={(element) => {
						tagElement = element;
					}}
				/>
				<Show when={props.item}>
					{(item) => (
						<ItemQrSection
							item={item}
							openSections={openSections}
							onOpenSectionsChange={setOpenSections}
						/>
					)}
				</Show>
			</Sheet.Body>
			<SheetCreateFooter
				create={actions.create}
				isCreating={actions.isCreating()}
			/>
		</Sheet.Root>
	);
}
