import {
	Accordion,
	Button,
	Sheet,
	Icon,
	PropertyRow,
	createSaveTracker,
	type SaveTracker,
} from "@j-os/design-system";
import { Show, createSignal, type Accessor, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";
import type { SheetNavState } from "../../../lib/createSheetNav.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import type { SaveWrite } from "../../../lib/reportSave.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createEntityDraft } from "../../../shared/entity/entityCommands.ts";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import { EntityQrBlock } from "../../../shared/entity/EntityQr.tsx";
import { EntitySheetHeader } from "../../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";
import type { Item, ItemPatch, ItemType } from "../data/inventoryData.ts";
import { useItemActions } from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";
import { itemFields } from "../fields.ts";

import { AssetTagInput } from "./AssetTagInput.tsx";
import { detailsFromItem } from "./copyFromItem.ts";
import { CopyFromItemDialog } from "./CopyFromItemDialog.tsx";
import { FieldsPlaceholder } from "./FieldsPlaceholder.tsx";
import { createInventoryCommands } from "./inventoryCommands.ts";
import { DescriptionValue, OptionSelect } from "./InventoryForm.tsx";

/** The rows the skeleton stands in for: the sheet's own fields. */
const PLACEHOLDER_FIELDS = [
	itemFields.assetTag,
	itemFields.typeName,
	itemFields.description,
];

type ItemSheetProps = SheetOpenProps & {
	item?: Item;
	itemTypes: ItemType[];
	items?: Item[];
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
	const confirm = useConfirm();

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
		async deleteItem() {
			if (!props.item) return;
			const isOk = await confirm({
				title: "Delete this item?",
				message: "This can't be undone.",
				confirmLabel: "Delete",
				tone: "danger",
			});
			if (!isOk) return;
			await commands.remove(props.item._id);
		},
	};
}

type ItemForm = ReturnType<typeof createItemForm>;

/** Opens the copy-from-item dialog; disabled while there is nothing to copy. */
function CopyFromItemButton(props: {
	hasNoItems: boolean;
	onCopy: () => void;
}) {
	return (
		<Button
			variant="tertiary"
			disabled={props.hasNoItems}
			disabledReason="No items to copy from yet"
			onClick={() => {
				props.onCopy();
			}}
		>
			<Icon>{ICONS.copy}</Icon>
			Copy from item
		</Button>
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

/** The create button, enabled once there is a valid asset tag and a type. */
function CreateFooter(props: { form: ItemForm }) {
	return (
		<EntityCreateFooter
			label="Create item"
			disabledReason="Add a valid asset tag and type first"
			canCreate={
				props.form.tagLooksValid() &&
				props.form.typeId.value() !== undefined
			}
			onCreate={() => {
				void props.form.createItem();
			}}
		/>
	);
}

/** The item type picker, labelled "name · category". */
function ItemTypeSelect(props: {
	itemTypes: ItemType[];
	typeId: ItemForm["typeId"];
}) {
	return (
		<OptionSelect
			property={itemFields.typeName}
			placeholder="Choose a type"
			options={props.itemTypes.map((itemType) => ({
				value: itemType._id,
				label: `${itemType.name} · ${itemType.categoryName}`,
			}))}
			field={props.typeId}
		/>
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
	itemTypes: ItemType[];
	form: ItemForm;
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
				itemTypes={props.itemTypes}
				typeId={props.form.typeId}
			/>
			<DescriptionValue
				field={itemFields.description}
				description={props.form.description}
			/>
			<InlineError message={props.form.formError()} />
		</>
	);
}

export function ItemSheet(props: ItemSheetProps): JSX.Element {
	const form = createItemForm(props);
	const [copyOpen, setCopyOpen] = createSignal(false);
	// Controlled + onValueChange so the section actually collapses (matches
	// community's PersonDetail). A bare `value` with no setter pins it open.
	const [openSections, setOpenSections] = createSignal(["qr"]);

	function isEdit() {
		return props.item !== undefined;
	}

	let tagElement: HTMLInputElement | undefined;

	return (
		<>
			<Sheet.Root
				open={props.open}
				prebuild={props.prebuild}
				morphId={props.item?._id}
				{...form.sheet}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setCopyOpen(false);
						form.clearFormError();
					}
					form.draft.onOpenChange(isOpen);
				}}
				initialFocusEl={() => tagElement ?? null}
			>
				<EntitySheetHeader.Root
					title={props.item?.assetTag ?? "New item"}
					loading={props.loading}
					nav={props.nav}
					saveStatus={isEdit() && !props.loading}
				>
					<Show when={isEdit()}>
						<EntitySheetHeader.Delete
							label="Delete item"
							onDelete={() => void form.deleteItem()}
						/>
					</Show>
				</EntitySheetHeader.Root>
				<Sheet.Skeleton>
					<FieldsPlaceholder fields={PLACEHOLDER_FIELDS} />
				</Sheet.Skeleton>
				<Sheet.Body loading={props.loading}>
					<Show when={!isEdit()}>
						<CopyFromItemButton
							hasNoItems={(props.items ?? []).length === 0}
							onCopy={() => {
								setCopyOpen(true);
							}}
						/>
					</Show>
					<ItemFormFields
						item={props.item}
						itemTypes={props.itemTypes}
						form={form}
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
				<Show when={!props.loading && !isEdit()}>
					<CreateFooter form={form} />
				</Show>
			</Sheet.Root>
			<CopyFromItemDialog
				open={copyOpen()}
				onOpenChange={setCopyOpen}
				items={props.items ?? []}
				onSelect={form.copyFrom}
			/>
		</>
	);
}
