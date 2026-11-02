import { Sheet, createSaveTracker } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { SheetNavState } from "../../../lib/createSheetNav.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import type { ConfirmOptions } from "../../../shared/confirm.tsx";
import { createEntityDraft } from "../../../shared/entity/entityCommands.ts";
import { SheetCreateFooter } from "../../../shared/entity/SheetCreateFooter.tsx";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";
import type { Category, CategoryPatch } from "../data/inventoryData.ts";
import {
	useCategoryActions,
	useItemTypesByCategory,
} from "../data/inventoryData.ts";
import { categoryFields } from "../fields.ts";

import { createInventoryCommands } from "./inventoryCommands.ts";
import { NameField } from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";
import {
	createInventorySheetActions,
	InventorySheetHeader,
} from "./SheetHeaderActions.tsx";

const DELETE_CATEGORY_CONFIRM: ConfirmOptions = {
	title: "Delete this category?",
	message:
		"This can't be undone. Item types that still use it will block the delete.",
	confirmLabel: "Delete",
	tone: "danger",
};

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
		/** Deletes the open row (asked first, by its Delete). */
		remove: commands.remove,
	};
}

/** The open category's item types. Subscribes only while the sheet is open
 *  AND an existing (saved) category is selected: closed or create-mode passes
 *  `undefined`, which `useItemTypesByCategory` treats as "don't subscribe". */
function useOpenCategoryTypes(props: CategorySheetProps) {
	return useItemTypesByCategory(() =>
		props.open && props.category ? props.category._id : undefined
	);
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

	const typesQuery = useOpenCategoryTypes(props);

	const actions = createInventorySheetActions({
		scope: "category-sheet",
		noun: "category",
		confirm: DELETE_CATEGORY_CONFIRM,
		isOpen: () => props.open,
		isLoading: () => props.loading,
		row: () => props.category,
		remove: form.remove,
		error: form.formError,
		create: {
			can: () => form.name.value().trim() !== "",
			disabledReason: () => "Add a name first",
			run: () => form.createCategory(),
		},
	});

	let nameElement: HTMLInputElement | undefined;

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			morphId={props.category?._id}
			{...form.sheet}
			initialFocusEl={() => nameElement ?? null}
		>
			<InventorySheetHeader
				title={props.category?.name ?? "New category"}
				loading={props.loading}
				nav={props.nav}
				actions={actions}
				isOpen={props.open}
				placeholderFields={[
					categoryFields.name,
					categoryFields.description,
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
				<DescriptionField
					field={categoryFields.description}
					description={form.description}
					readOnly={actions.isLocked()}
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
			<SheetCreateFooter
				create={actions.create}
				isCreating={actions.isCreating()}
			/>
		</Sheet.Root>
	);
}
