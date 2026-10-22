import { Sheet, PropertyRow } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { call } from "../../../lib/call.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import {
	createActionError,
	scopeOfFields,
} from "../../../shared/createActionError.ts";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import {
	EntitySheetHeader,
	type SheetNavState,
} from "../../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { Category, ItemType } from "../data/inventoryData.ts";
import { useItemsByType, useItemTypeActions } from "../data/inventoryData.ts";
import { itemTypeFields } from "../fields.ts";

import { DescriptionValue, NameField, OptionSelect } from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";

/**
 * Placeholder field layout passed to `Sheet.Body`'s `skeleton` while
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

type ItemTypeSheetProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	itemType?: ItemType;
	categories: Category[];
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `itemType` (which is undefined in both states). */
	loading?: boolean;
	nav?: SheetNavState;
};

/** The item type's three fields, each saved as it is typed. */
function createItemTypeFields(
	props: ItemTypeSheetProps,
	patch: (change: Record<string, unknown>) => Promise<void>
) {
	function key() {
		return `${String(props.open)}:${props.itemType?._id ?? "new"}`;
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
	return { name, categoryId, description };
}

/** The item type's fields and the actions that create and delete it. */
function createItemTypeForm(props: ItemTypeSheetProps) {
	const actions = useItemTypeActions();
	const confirm = useConfirm();
	const failure = createActionError();

	async function patch(change: Record<string, unknown>) {
		const itemType = props.itemType;
		if (!itemType) return;
		await failure.trackResult(
			call(
				actions.update({ id: itemType._id, ...change }),
				"Could not save."
			),
			scopeOfFields(change)
		);
	}

	const fields = createItemTypeFields(props, patch);

	return {
		...fields,
		formError: failure.error,
		/** Forwards the sheet's open state, dropping a stale error on close. */
		onOpenChange: (isOpen: boolean) => {
			if (!isOpen) failure.clear();
			props.onOpenChange(isOpen);
		},
		async createItemType() {
			const selected = fields.categoryId.value();
			if (!fields.name.value().trim() || selected === undefined) return;
			const created = await failure.trackResult(
				call(
					actions.create({
						name: fields.name.value(),
						categoryId: selected,
						description:
							fields.description.value().trim() || undefined,
					}),
					"Could not create."
				)
			);
			if (created.isOk()) props.onOpenChange(false);
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
			const deleted = await failure.trackResult(
				call(actions.remove(itemType._id), "Could not delete.")
			);
			if (deleted.isOk()) props.onOpenChange(false);
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

	// Subscribes only while the sheet is open AND an existing (saved) type is
	// selected — closed or create-mode passes `undefined`, which
	// `useItemsByType` treats as "don't subscribe".
	const itemsQuery = useItemsByType(() =>
		props.open && props.itemType ? props.itemType._id : undefined
	);

	let nameElement: HTMLInputElement | undefined;

	return (
		<Sheet.Root
			open={props.open}
			morph={props.itemType?._id}
			onOpenChange={form.onOpenChange}
			initialFocusEl={() => nameElement ?? null}
		>
			<EntitySheetHeader
				title={props.itemType?.name ?? "New item type"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete item type"
				onDelete={() => {
					void form.deleteItemType();
				}}
			/>
			<Sheet.Body
				loading={props.loading}
				skeleton={<ItemTypeFieldsPlaceholder />}
			>
				<NameField
					name={form.name}
					hasError={form.formError() !== null}
					onElement={(element) => {
						nameElement = element;
					}}
				/>
				<OptionSelect
					property={itemTypeFields.categoryName}
					placeholder="Choose a category"
					options={props.categories.map((category) => ({
						value: category._id,
						title: category.name,
					}))}
					field={form.categoryId}
				/>
				<DescriptionValue
					field={itemTypeFields.description}
					description={form.description}
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
			<Show when={!props.loading && !isEdit()}>
				<CreateFooter form={form} />
			</Show>
		</Sheet.Root>
	);
}
