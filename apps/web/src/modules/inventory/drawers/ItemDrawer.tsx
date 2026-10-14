import {
	Accordion,
	Button,
	Drawer,
	Icon,
	Input,
	PropertyRow,
} from "@j-os/design-system";
import { Show, createSignal, type Accessor, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { useConfirm } from "../../../shared/confirm.tsx";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import {
	EntityDrawerHeader,
	type DrawerNavState,
} from "../../../shared/entity/EntityDrawerHeader.tsx";
import { EntityQrBlock } from "../../../shared/entity/EntityQr.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Item, ItemType } from "../data/inventoryData.ts";
import { useItemActions } from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";

import { detailsFromItem } from "./copyFromItem.ts";
import { CopyFromItemDialog } from "./CopyFromItemDialog.tsx";
import styles from "./InventoryDrawer.module.scss";
import { FormErrorLine, OptionSelect, runAttempt } from "./InventoryForm.tsx";

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while
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

type ItemDrawerProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	item?: Item;
	itemTypes: ItemType[];
	items?: Item[];
	initialAssetTag?: string;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `item` (which is undefined in both states). */
	loading?: boolean;
	nav?: DrawerNavState;
};

/** The item's three fields, each saved as it is typed (the asset tag is
 *  create-only). */
function createItemFields(
	props: ItemDrawerProps,
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
		// drawer shut mid-edit, so there is deliberately no write here.
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
	try {
		parseAssetTag(tag);
		return true;
	} catch {
		return false;
	}
}

/** The item's fields and the actions that create and delete it. */
function createItemForm(props: ItemDrawerProps) {
	const actions = useItemActions();
	const confirm = useConfirm();
	const [formError, setFormError] = createSignal<string>();

	async function patch(change: Record<string, unknown>) {
		const item = props.item;
		if (!item) return;
		await runAttempt(setFormError, "Could not save.", () =>
			actions.update({ id: item._id, ...change })
		);
	}

	const fields = createItemFields(props, patch);

	function tagLooksValid() {
		return isAssetTagValid(fields.assetTag.value());
	}

	return {
		...fields,
		formError,
		setFormError,
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
			const isCreated = await runAttempt(
				setFormError,
				"Could not create.",
				() =>
					actions.create({
						typeId: selected,
						assetTag: fields.assetTag.value(),
						description:
							fields.description.value().trim() || undefined,
					})
			);
			if (isCreated) props.onOpenChange(false);
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
			const isDeleted = await runAttempt(
				setFormError,
				"Could not delete.",
				() => actions.remove(item._id)
			);
			if (isDeleted) props.onOpenChange(false);
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

/** The asset tag: an input while creating, read-only text for an existing
 *  item (its tag is its slug). */
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
				<PropertyRow icon={ICONS.assetTag} label="Asset tag">
					<span>{props.item!.assetTag}</span>
				</PropertyRow>
			}
		>
			<Input
				label="Asset tag"
				required
				helperText="One letter and five digits, e.g. A00000"
				ref={(element: HTMLInputElement) => {
					props.onElement(element);
				}}
				value={props.assetTag.value()}
				onInput={(event) => {
					props.assetTag.set(event.currentTarget.value);
				}}
				onBlur={props.assetTag.flush}
				invalid={props.hasError}
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
			icon={ICONS.itemType}
			label="Type"
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
				hasError={props.form.formError() !== undefined}
				onElement={props.onTagElement}
			/>
			<ItemTypeSelect
				itemTypes={props.itemTypes}
				typeId={props.form.typeId}
			/>
			<DescriptionField
				class={styles.description}
				description={props.form.description}
			/>
			<FormErrorLine error={props.form.formError} />
		</>
	);
}

export function ItemDrawer(props: ItemDrawerProps): JSX.Element {
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
			<Drawer.Root
				open={props.open}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						setCopyOpen(false);
						form.setFormError(undefined);
					}
					props.onOpenChange(isOpen);
				}}
				initialFocusEl={() => tagElement ?? null}
			>
				<EntityDrawerHeader
					title={isEdit() ? "Item" : "New item"}
					loading={props.loading}
					nav={props.nav}
					isEdit={isEdit()}
					deleteLabel="Delete item"
					onDelete={() => {
						void form.deleteItem();
					}}
				/>
				<Drawer.Body
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
				</Drawer.Body>
				<Show when={!props.loading && !isEdit()}>
					<CreateFooter form={form} />
				</Show>
			</Drawer.Root>
			<CopyFromItemDialog
				open={copyOpen()}
				onOpenChange={setCopyOpen}
				items={props.items ?? []}
				onSelect={form.copyFrom}
			/>
		</>
	);
}
