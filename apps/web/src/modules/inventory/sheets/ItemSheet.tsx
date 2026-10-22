import {
	Accordion,
	Button,
	Sheet,
	Icon,
	PropertyRow,
} from "@j-os/design-system";
import { Show, createSignal, type Accessor, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";
import { call } from "../../../lib/call.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import {
	createActionError,
	scopeOfFields,
} from "../../../shared/createActionError.ts";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import { EntityQrBlock } from "../../../shared/entity/EntityQr.tsx";
import {
	EntitySheetHeader,
	type SheetNavState,
} from "../../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { Item, ItemType } from "../data/inventoryData.ts";
import { useItemActions } from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";
import { itemFields } from "../fields.ts";

import { AssetTagInput } from "./AssetTagInput.tsx";
import { detailsFromItem } from "./copyFromItem.ts";
import { CopyFromItemDialog } from "./CopyFromItemDialog.tsx";
import { DescriptionValue, OptionSelect } from "./InventoryForm.tsx";

/**
 * Placeholder field layout passed to `Sheet.Body`'s `skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded field list (mirrors `EventFieldsPlaceholder`); literal
 * "placeholder" text, never real or create-form copy.
 */
function ItemFieldsPlaceholder() {
	return (
		<>
			<PropertyRow icon={ICONS.assetTag} label="Asset tag">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.itemType} label="Type">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type ItemSheetProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
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
	patch: (change: Record<string, unknown>) => Promise<void>
) {
	function key() {
		return `${String(props.open)}:${props.item?._id ?? "new"}:${props.initialAssetTag ?? ""}`;
	}

	const assetTag = createSyncedField({
		remote: () => props.item?.assetTag ?? props.initialAssetTag ?? "",
		key,
		// Create-only field: the tag is read-only text in edit mode (below), so
		// this never fires there — `createItem` sends it once. Autosaving it
		// would rename the slug (`selected()` matches on assetTag) and slam the
		// sheet shut mid-edit, so there is deliberately no write here.
		write: () => {},
	});
	const typeId = createSyncedField<Id<"itemTypes"> | undefined>({
		remote: () => props.item?.typeId,
		key,
		write: (value) => {
			if (value) void patch({ typeId: value });
		},
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.item?.description ?? "",
		key,
		write: (value) => {
			void patch({ description: value.trim() === "" ? null : value });
		},
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
	const failure = createActionError();

	async function patch(change: Record<string, unknown>) {
		const item = props.item;
		if (!item) return;
		await failure.trackResult(
			call(
				actions.update({ id: item._id, ...change }),
				"Could not save."
			),
			scopeOfFields(change)
		);
	}

	const fields = createItemFields(props, patch);

	function tagLooksValid() {
		return isAssetTagValid(fields.assetTag.value());
	}

	return {
		...fields,
		formError: failure.error,
		clearFormError: failure.clear,
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
			const created = await failure.trackResult(
				call(
					actions.create({
						typeId: selected,
						assetTag: fields.assetTag.value(),
						description:
							fields.description.value().trim() || undefined,
					}),
					"Could not create."
				)
			);
			if (created.isOk()) props.onOpenChange(false);
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
			const item = props.item;
			const deleted = await failure.trackResult(
				call(actions.remove(item._id), "Could not delete.")
			);
			if (deleted.isOk()) props.onOpenChange(false);
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
 *  text for an existing item (its tag is its slug). */
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
				<PropertyRow field={itemFields.assetTag}>
					<span>{props.item!.assetTag}</span>
				</PropertyRow>
			}
		>
			<AssetTagInput
				value={props.assetTag.value()}
				onChange={props.assetTag.set}
				onFlush={props.assetTag.flush}
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
				title: `${itemType.name} · ${itemType.categoryName}`,
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
				morph={props.item?._id}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setCopyOpen(false);
						form.clearFormError();
					}
					props.onOpenChange(isOpen);
				}}
				initialFocusEl={() => tagElement ?? null}
			>
				<EntitySheetHeader
					title={isEdit() ? "Item" : "New item"}
					loading={props.loading}
					nav={props.nav}
					isEdit={isEdit()}
					deleteLabel="Delete item"
					onDelete={() => {
						void form.deleteItem();
					}}
				/>
				<Sheet.Body
					loading={props.loading}
					skeleton={<ItemFieldsPlaceholder />}
				>
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
