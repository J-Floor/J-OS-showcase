import { Button, Drawer, PropertyRow } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { useConfirm } from "../../../shared/confirm.tsx";
import {
	EntityDrawerHeader,
	type DrawerNavState,
} from "../../../shared/entity/EntityDrawerHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Category } from "../data/inventoryData.ts";
import {
	useCategoryActions,
	useItemTypesByCategory,
} from "../data/inventoryData.ts";

import styles from "./InventoryDrawer.module.scss";
import { FormErrorLine, NameField, runAttempt } from "./InventoryForm.tsx";
import { RelatedListSection } from "./RelatedListSection.tsx";

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while
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

type CategoryDrawerProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	category?: Category;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `category` (which is undefined in both states). */
	loading?: boolean;
	nav?: DrawerNavState;
};

/** The category's fields (saved as they are typed) and the actions that
 *  create and delete it. */
function createCategoryForm(props: CategoryDrawerProps) {
	const actions = useCategoryActions();
	const confirm = useConfirm();
	const [formError, setFormError] = createSignal<string>();

	function key() {
		return `${String(props.open)}:${props.category?._id ?? "new"}`;
	}

	async function patch(change: Record<string, unknown>) {
		const category = props.category;
		if (!category) return;
		await runAttempt(setFormError, "Could not save.", () =>
			actions.update({ id: category._id, ...change })
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
		formError,
		/** Forwards the drawer's open state, dropping a stale error on close. */
		onOpenChange: (isOpen: boolean) => {
			if (!isOpen) setFormError(undefined);
			props.onOpenChange(isOpen);
		},
		async createCategory() {
			if (!name.value().trim()) return;
			const isCreated = await runAttempt(
				setFormError,
				"Could not create.",
				() =>
					actions.create({
						name: name.value(),
						description: description.value().trim() || undefined,
					})
			);
			if (isCreated) props.onOpenChange(false);
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
			const isDeleted = await runAttempt(
				setFormError,
				"Could not delete.",
				() => actions.remove(category._id)
			);
			if (isDeleted) props.onOpenChange(false);
		},
	};
}

export function CategoryDrawer(props: CategoryDrawerProps): JSX.Element {
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

	// Subscribes only while the drawer is open AND an existing (saved)
	// category is selected — closed or create-mode passes `undefined`, which
	// `useItemTypesByCategory` treats as "don't subscribe".
	const typesQuery = useItemTypesByCategory(() =>
		props.open && props.category ? props.category._id : undefined
	);

	let nameElement: HTMLInputElement | undefined;

	return (
		<Drawer.Root
			open={props.open}
			onOpenChange={form.onOpenChange}
			initialFocusEl={() => nameElement ?? null}
		>
			<EntityDrawerHeader
				title={isEdit() ? "Category" : "New category"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete category"
				onDelete={() => {
					void form.deleteCategory();
				}}
			/>
			<Drawer.Body
				loading={props.loading}
				skeleton={<CategoryFieldsPlaceholder />}
			>
				<NameField
					name={form.name}
					hasError={form.formError() !== undefined}
					onElement={(element) => {
						nameElement = element;
					}}
				/>
				<DescriptionField
					class={styles.description}
					description={form.description}
				/>
				<FormErrorLine error={form.formError} />
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
			</Drawer.Body>
			<Show when={!props.loading && !isEdit()}>
				<Drawer.Footer>
					<Button
						disabled={!form.name.value().trim()}
						disabledReason="Add a name first"
						onClick={() => {
							void form.createCategory();
						}}
					>
						Create category
					</Button>
				</Drawer.Footer>
			</Show>
		</Drawer.Root>
	);
}
