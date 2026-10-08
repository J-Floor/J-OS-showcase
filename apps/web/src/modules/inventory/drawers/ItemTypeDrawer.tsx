import {
	Accordion,
	Button,
	Drawer,
	DrawerNav,
	IconButton,
	Input,
	PropertyRow,
	Select,
	TextArea,
} from "@j-os/design-system";
import { For, Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Category, ItemType } from "../data/inventoryData.ts";
import { useItemsByType, useItemTypeActions } from "../data/inventoryData.ts";

import styles from "./InventoryDrawer.module.scss";

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

export function ItemTypeDrawer(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	itemType?: ItemType;
	categories: Category[];
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `itemType` (which is undefined in both states). */
	loading?: boolean;
	nav?: {
		hasPrev: () => boolean;
		hasNext: () => boolean;
		onPrev: () => void;
		onNext: () => void;
	};
}): JSX.Element {
	const actions = useItemTypeActions();
	const confirm = useConfirm();
	const [formError, setFormError] = createSignal<string>();
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

	let nameEl: HTMLInputElement | undefined;

	function key() {
		return `${String(props.open)}:${props.itemType?._id ?? "new"}`;
	}

	async function patch(p: Record<string, unknown>) {
		if (!props.itemType) return;
		try {
			await actions.update({ id: props.itemType._id, ...p });
			setFormError(undefined);
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not save."
			);
		}
	}

	const name = createSyncedField({
		remote: () => props.itemType?.name ?? "",
		key,
		write: (v) => {
			void patch({ name: v });
		},
	});
	const categoryId = createSyncedField<Id<"itemCategories"> | undefined>({
		remote: () => props.itemType?.categoryId,
		key,
		write: (v) => {
			if (v) void patch({ categoryId: v });
		},
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.itemType?.description ?? "",
		key,
		write: (v) => {
			void patch({ description: v.trim() === "" ? null : v });
		},
	});

	function categoryOptions() {
		return props.categories.map((c) => ({ value: c._id, title: c.name }));
	}

	function selectedCategory(): string[] {
		const id = categoryId.value();
		return id === undefined ? [] : [id];
	}

	async function createItemType() {
		const selected = categoryId.value();
		if (!name.value().trim() || selected === undefined) return;
		try {
			await actions.create({
				name: name.value(),
				categoryId: selected,
				description: description.value().trim() || undefined,
			});
			setFormError(undefined);
			props.onOpenChange(false);
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not create."
			);
		}
	}

	async function deleteItemType() {
		if (!props.itemType) return;
		const ok = await confirm({
			title: "Delete this item type?",
			message:
				"This can't be undone. Items that still use it will block the delete.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!ok) return;
		try {
			await actions.remove(props.itemType._id);
			setFormError(undefined);
			props.onOpenChange(false);
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not delete."
			);
		}
	}

	return (
		<Drawer.Root
			open={props.open}
			onOpenChange={(open) => {
				if (!open) {
					setFormError(undefined);
				}
				props.onOpenChange(open);
			}}
			initialFocusEl={() => nameEl ?? null}
		>
			<Drawer.Header>
				<Drawer.Title loading={props.loading}>
					{isEdit() ? "Item type" : "New item type"}
				</Drawer.Title>
				<Drawer.HeaderActions>
					<Show when={props.nav}>
						{(n) => (
							<DrawerNav
								onPrev={n().onPrev}
								onNext={n().onNext}
								hasPrev={n().hasPrev()}
								hasNext={n().hasNext()}
							/>
						)}
					</Show>
					<Show when={isEdit()}>
						<IconButton
							tooltipLabel="Delete item type"
							onClick={() => {
								void deleteItemType();
							}}
						>
							{ICONS.delete}
						</IconButton>
					</Show>
					<Drawer.Close />
				</Drawer.HeaderActions>
			</Drawer.Header>
			<Drawer.Body
				loading={props.loading}
				skeleton={<ItemTypeFieldsPlaceholder />}
			>
				<Input
					label="Name"
					required
					ref={(el: HTMLInputElement) => {
						nameEl = el;
					}}
					value={name.value()}
					onInput={(e) => {
						name.set(e.currentTarget.value);
					}}
					onBlur={name.flush}
					invalid={formError() !== undefined}
				/>
				<PropertyRow icon={ICONS.category} label="Category">
					<Select.Root
						options={categoryOptions()}
						value={selectedCategory()}
						placeholder="Choose a category"
						sameWidth
						onValueChange={(d) => {
							categoryId.set(
								d.value[0] as Id<"itemCategories"> | undefined
							);
						}}
					>
						<Select.Content>
							<For each={categoryOptions()}>
								{(o) => (
									<Select.Option
										value={o.value}
										title={o.title}
									/>
								)}
							</For>
						</Select.Content>
					</Select.Root>
				</PropertyRow>
				<div class={styles.description}>
					<TextArea
						label="Description"
						autoresize
						value={description.value()}
						onInput={(value) => {
							description.set(value);
						}}
						onBlur={description.flush}
					/>
				</div>
				<Show when={formError()}>
					{(message) => <p class={styles.error}>{message()}</p>}
				</Show>
				<Show when={isEdit()}>
					<Accordion.Root
						value={openItemsSection()}
						onValueChange={(d) => {
							setOpenItemsSection(d.value);
						}}
					>
						<Accordion.Item value="items">
							<Accordion.ItemTitle>
								{`Items (${(itemsQuery.data() ?? []).length})`}
							</Accordion.ItemTitle>
							<Accordion.ItemContent>
								<div class={styles.section}>
									<Show
										when={
											(itemsQuery.data() ?? []).length > 0
										}
										fallback={
											<p class={styles.empty}>
												No items yet
											</p>
										}
									>
										<ul class={styles.list}>
											<For each={itemsQuery.data() ?? []}>
												{(item) => (
													<li class={styles.listRow}>
														{item.assetTag}
													</li>
												)}
											</For>
										</ul>
									</Show>
								</div>
							</Accordion.ItemContent>
						</Accordion.Item>
					</Accordion.Root>
				</Show>
			</Drawer.Body>
			<Show when={!props.loading && !isEdit()}>
				<Drawer.Footer>
					<Button
						disabled={
							!name.value().trim() ||
							categoryId.value() === undefined
						}
						disabledReason="Add a name and category first"
						onClick={() => {
							void createItemType();
						}}
					>
						Create item type
					</Button>
				</Drawer.Footer>
			</Show>
		</Drawer.Root>
	);
}
