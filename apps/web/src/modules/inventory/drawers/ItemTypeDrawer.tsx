import { Drawer, PropertyRow } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { useConfirm } from "../../../shared/confirm.tsx";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import {
	EntityDrawerHeader,
	type DrawerNavState,
} from "../../../shared/entity/EntityDrawerHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Category, ItemType } from "../data/inventoryData.ts";
import { useItemsByType, useItemTypeActions } from "../data/inventoryData.ts";

import styles from "./InventoryDrawer.module.scss";
import {
	FormErrorLine,
	NameField,
	OptionSelect,
	runAttempt,
} from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded field list (mirrors `EventFieldsPlaceholder`); literal
 * "placeholder" text, never real or create-form copy.
 */
function ItemTypeFieldsPlaceholder() {
	return (
		<>
			<PropertyRow icon={ICONS.name} label="Name">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.category} label="Category">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type ItemTypeDrawerProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	itemType?: ItemType;
	categories: Category[];
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `itemType` (which is undefined in both states). */
	loading?: boolean;
	nav?: DrawerNavState;
};

/** The item type's fields (saved as they are typed) and the actions that
 *  create and delete it. */
function createItemTypeForm(props: ItemTypeDrawerProps) {
	const actions = useItemTypeActions();
	const confirm = useConfirm();
	const [formError, setFormError] = createSignal<string>();

	function key() {
		return `${String(props.open)}:${props.itemType?._id ?? "new"}`;
	}

	async function patch(change: Record<string, unknown>) {
		const itemType = props.itemType;
		if (!itemType) return;
		await runAttempt(setFormError, "Could not save.", () =>
			actions.update({ id: itemType._id, ...change })
		);
	}

	const name = createSyncedField({
		remote: () => props.itemType?.name ?? "",
		key,
		write: (value) => {
			void patch({ name: value });
		},
	});
	const categoryId = createSyncedField<Id<"itemCategories"> | undefined>({
		remote: () => props.itemType?.categoryId,
		key,
		write: (value) => {
			if (value) void patch({ categoryId: value });
		},
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.itemType?.description ?? "",
		key,
		write: (value) => {
			void patch({ description: value.trim() === "" ? null : value });
		},
	});

	return {
		name,
		categoryId,
		description,
		formError,
		/** Forwards the drawer's open state, dropping a stale error on close. */
		onOpenChange: (isOpen: boolean) => {
			if (!isOpen) setFormError(undefined);
			props.onOpenChange(isOpen);
		},
		async createItemType() {
			const selected = categoryId.value();
			if (!name.value().trim() || selected === undefined) return;
			const isCreated = await runAttempt(
				setFormError,
				"Could not create.",
				() =>
					actions.create({
						name: name.value(),
						categoryId: selected,
						description: description.value().trim() || undefined,
					})
			);
			if (isCreated) props.onOpenChange(false);
		},
		async deleteItemType() {
			if (!props.itemType) return;
			const isOk = await confirm({
				title: "Delete this item type?",
				message:
					"This can't be undone. Items that still use it will block the delete.",
				confirmLabel: "Delete",
				tone: "danger",
			});
			if (!isOk) return;
			const itemType = props.itemType;
			const isDeleted = await runAttempt(
				setFormError,
				"Could not delete.",
				() => actions.remove(itemType._id)
			);
			if (isDeleted) props.onOpenChange(false);
		},
	};
}

/** The create button, enabled once there is a name and a category. */
function CreateFooter(props: { form: ReturnType<typeof createItemTypeForm> }) {
	return (
		<EntityCreateFooter
			label="Create item type"
			disabledReason="Add a name and category first"
			canCreate={
				props.form.name.value().trim() !== "" &&
				props.form.categoryId.value() !== undefined
			}
			onCreate={() => {
				void props.form.createItemType();
			}}
		/>
	);
}

export function ItemTypeDrawer(props: ItemTypeDrawerProps): JSX.Element {
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

	// Subscribes only while the drawer is open AND an existing (saved) type is
	// selected — closed or create-mode passes `undefined`, which
	// `useItemsByType` treats as "don't subscribe".
	const itemsQuery = useItemsByType(() =>
		props.open && props.itemType ? props.itemType._id : undefined
	);

	let nameElement: HTMLInputElement | undefined;

	return (
		<Drawer.Root
			open={props.open}
			onOpenChange={form.onOpenChange}
			initialFocusEl={() => nameElement ?? null}
		>
			<EntityDrawerHeader
				title={isEdit() ? "Item type" : "New item type"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete item type"
				onDelete={() => {
					void form.deleteItemType();
				}}
			/>
			<Drawer.Body
				loading={props.loading}
				skeleton={<ItemTypeFieldsPlaceholder />}
			>
				<NameField
					name={form.name}
					hasError={form.formError() !== undefined}
					onElement={(element) => {
						nameElement = element;
					}}
				/>
				<OptionSelect
					icon={ICONS.category}
					label="Category"
					placeholder="Choose a category"
					options={props.categories.map((category) => ({
						value: category._id,
						title: category.name,
					}))}
					field={form.categoryId}
				/>
				<DescriptionField
					class={styles.description}
					description={form.description}
				/>
				<FormErrorLine error={form.formError} />
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
			</Drawer.Body>
			<Show when={!props.loading && !isEdit()}>
				<CreateFooter form={form} />
			</Show>
		</Drawer.Root>
	);
}
