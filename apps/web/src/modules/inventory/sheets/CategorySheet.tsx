import { Button, Sheet, PropertyRow } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import { call } from "../../../lib/call.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import {
	createActionError,
	scopeOfFields,
} from "../../../shared/createActionError.ts";
import {
	EntitySheetHeader,
	type SheetNavState,
} from "../../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { Category } from "../data/inventoryData.ts";
import {
	useCategoryActions,
	useItemTypesByCategory,
} from "../data/inventoryData.ts";
import { categoryFields } from "../fields.ts";

import { DescriptionValue, NameField } from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";

/**
 * Placeholder field layout shown by `Sheet.Skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded field list (mirrors `EventFieldsPlaceholder`); literal
 * "placeholder" text, never real or create-form copy.
 */
function CategoryFieldsPlaceholder() {
	return (
		<>
			<PropertyRow icon={ICONS.name} label="Name">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type CategorySheetProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
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
	const failure = createActionError();

	function key() {
		return `${String(props.open)}:${props.category?._id ?? "new"}`;
	}

	async function patch(change: Record<string, unknown>) {
		const category = props.category;
		if (!category) return;
		await failure.trackResult(
			call(
				actions.update({ id: category._id, ...change }),
				"Could not save."
			),
			scopeOfFields(change)
		);
	}

	const name = createSyncedField({
		remote: () => props.category?.name ?? "",
		key,
		write: (value) => {
			void patch({ name: value });
		},
	});
	const description = createSyncedField({
		remote: () => props.category?.description ?? "",
		key,
		write: (value) => {
			void patch({ description: value.trim() === "" ? null : value });
		},
	});

	return {
		name,
		description,
		formError: failure.error,
		/** Forwards the sheet's open state, dropping a stale error on close. */
		onOpenChange: (isOpen: boolean) => {
			if (!isOpen) failure.clear();
			props.onOpenChange(isOpen);
		},
		async createCategory() {
			if (!name.value().trim()) return;
			const created = await failure.trackResult(
				call(
					actions.create({
						name: name.value(),
						description: description.value().trim() || undefined,
					}),
					"Could not create."
				)
			);
			if (created.isOk()) props.onOpenChange(false);
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
			const category = props.category;
			const deleted = await failure.trackResult(
				call(actions.remove(category._id), "Could not delete.")
			);
			if (deleted.isOk()) props.onOpenChange(false);
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
			morph={props.category?._id}
			onOpenChange={form.onOpenChange}
			initialFocusEl={() => nameElement ?? null}
		>
			<EntitySheetHeader
				title={props.category?.name ?? "New category"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete category"
				onDelete={() => {
					void form.deleteCategory();
				}}
			/>
			<Sheet.Skeleton>
				<CategoryFieldsPlaceholder />
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
