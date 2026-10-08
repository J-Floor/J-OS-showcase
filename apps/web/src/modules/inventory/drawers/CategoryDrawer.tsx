import {
	Accordion,
	Button,
	Drawer,
	DrawerNav,
	IconButton,
	Input,
	PropertyRow,
	TextArea,
} from "@j-os/design-system";
import { For, Show, createSignal, type JSX } from "solid-js";

import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Category } from "../data/inventoryData.ts";
import {
	useCategoryActions,
	useItemTypesByCategory,
} from "../data/inventoryData.ts";

import styles from "./InventoryDrawer.module.scss";

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

export function CategoryDrawer(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	category?: Category;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `category` (which is undefined in both states). */
	loading?: boolean;
	nav?: {
		hasPrev: () => boolean;
		hasNext: () => boolean;
		onPrev: () => void;
		onNext: () => void;
	};
}): JSX.Element {
	const actions = useCategoryActions();
	const confirm = useConfirm();
	const [formError, setFormError] = createSignal<string>();
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

	let nameEl: HTMLInputElement | undefined;

	function key() {
		return `${String(props.open)}:${props.category?._id ?? "new"}`;
	}

	async function patch(p: Record<string, unknown>) {
		if (!props.category) return;
		try {
			await actions.update({ id: props.category._id, ...p });
			setFormError(undefined);
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not save."
			);
		}
	}

	const name = createSyncedField({
		remote: () => props.category?.name ?? "",
		key,
		write: (v) => {
			void patch({ name: v });
		},
	});
	const description = createSyncedField({
		remote: () => props.category?.description ?? "",
		key,
		write: (v) => {
			void patch({ description: v.trim() === "" ? null : v });
		},
	});

	async function createCategory() {
		if (!name.value().trim()) return;
		try {
			await actions.create({
				name: name.value(),
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

	async function deleteCategory() {
		if (!props.category) return;
		const ok = await confirm({
			title: "Delete this category?",
			message:
				"This can't be undone. Item types that still use it will block the delete.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!ok) return;
		try {
			await actions.remove(props.category._id);
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
					{isEdit() ? "Category" : "New category"}
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
							tooltipLabel="Delete category"
							onClick={() => {
								void deleteCategory();
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
				skeleton={<CategoryFieldsPlaceholder />}
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
						value={openTypesSection()}
						onValueChange={(d) => {
							setOpenTypesSection(d.value);
						}}
					>
						<Accordion.Item value="types">
							<Accordion.ItemTitle>
								{`Item types (${(typesQuery.data() ?? []).length})`}
							</Accordion.ItemTitle>
							<Accordion.ItemContent>
								<div class={styles.section}>
									<Show
										when={
											(typesQuery.data() ?? []).length > 0
										}
										fallback={
											<p class={styles.empty}>
												No item types yet
											</p>
										}
									>
										<ul class={styles.list}>
											<For each={typesQuery.data() ?? []}>
												{(type) => (
													<li class={styles.listRow}>
														{type.name}
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
						disabled={!name.value().trim()}
						disabledReason="Add a name first"
						onClick={() => {
							void createCategory();
						}}
					>
						Create category
					</Button>
				</Drawer.Footer>
			</Show>
		</Drawer.Root>
	);
}
