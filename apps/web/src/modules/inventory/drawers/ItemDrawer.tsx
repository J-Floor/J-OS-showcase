import {
	Accordion,
	Button,
	Drawer,
	DrawerNav,
	Icon,
	IconButton,
	Input,
	PropertyRow,
	Select,
	TextArea,
} from "@j-os/design-system";
import { For, Show, createSignal, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { EntityQrBlock } from "../../../shared/entity/EntityQr.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Item, ItemType } from "../data/inventoryData.ts";
import { useItemActions } from "../data/inventoryData.ts";
import { itemEntity } from "../entity.ts";

import { detailsFromItem } from "./copyFromItem.ts";
import { CopyFromItemDialog } from "./CopyFromItemDialog.tsx";
import styles from "./InventoryDrawer.module.scss";

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

export function ItemDrawer(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item?: Item;
	itemTypes: ItemType[];
	items?: Item[];
	initialAssetTag?: string;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `item` (which is undefined in both states). */
	loading?: boolean;
	nav?: {
		hasPrev: () => boolean;
		hasNext: () => boolean;
		onPrev: () => void;
		onNext: () => void;
	};
}): JSX.Element {
	const actions = useItemActions();
	const confirm = useConfirm();
	const [copyOpen, setCopyOpen] = createSignal(false);
	const [formError, setFormError] = createSignal<string>();
	// Controlled + onValueChange so the section actually collapses (matches
	// community's PersonDetail). A bare `value` with no setter pins it open.
	const [openSections, setOpenSections] = createSignal(["qr"]);

	function isEdit() {
		return props.item !== undefined;
	}

	let tagEl: HTMLInputElement | undefined;

	function key() {
		return `${String(props.open)}:${props.item?._id ?? "new"}:${props.initialAssetTag ?? ""}`;
	}

	async function patch(p: Record<string, unknown>) {
		if (!props.item) return;
		try {
			await actions.update({ id: props.item._id, ...p });
			setFormError(undefined);
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not save."
			);
		}
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
		write: (v) => {
			if (v) void patch({ typeId: v });
		},
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.item?.description ?? "",
		key,
		write: (v) => {
			void patch({ description: v.trim() === "" ? null : v });
		},
	});

	function typeOptions() {
		return props.itemTypes.map((t) => ({
			value: t._id,
			title: `${t.name} · ${t.categoryName}`,
		}));
	}

	function selectedType(): string[] {
		const id = typeId.value();
		return id === undefined ? [] : [id];
	}

	function tagLooksValid() {
		try {
			parseAssetTag(assetTag.value());
			return true;
		} catch {
			return false;
		}
	}

	async function createItem() {
		const selected = typeId.value();
		if (!tagLooksValid() || selected === undefined) return;
		try {
			await actions.create({
				typeId: selected,
				assetTag: assetTag.value(),
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

	async function deleteItem() {
		if (!props.item) return;
		const ok = await confirm({
			title: "Delete this item?",
			message: "This can't be undone.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!ok) return;
		try {
			await actions.remove(props.item._id);
			setFormError(undefined);
			props.onOpenChange(false);
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not delete."
			);
		}
	}

	return (
		<>
			<Drawer.Root
				open={props.open}
				onOpenChange={(open) => {
					if (!open) {
						setCopyOpen(false);
						setFormError(undefined);
					}
					props.onOpenChange(open);
				}}
				initialFocusEl={() => tagEl ?? null}
			>
				<Drawer.Header>
					<Drawer.Title loading={props.loading}>
						{isEdit() ? "Item" : "New item"}
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
								tooltipLabel="Delete item"
								onClick={() => {
									void deleteItem();
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
					skeleton={<ItemFieldsPlaceholder />}
				>
					<Show when={!isEdit()}>
						<Button
							variant="tertiary"
							disabled={(props.items ?? []).length === 0}
							disabledReason="No items to copy from yet"
							onClick={() => {
								setCopyOpen(true);
							}}
						>
							<Icon>{ICONS.copy}</Icon>
							Copy from item
						</Button>
					</Show>
					<Show
						when={!isEdit()}
						fallback={
							<PropertyRow
								icon={ICONS.assetTag}
								label="Asset tag"
							>
								<span>{props.item!.assetTag}</span>
							</PropertyRow>
						}
					>
						<Input
							label="Asset tag"
							required
							helperText="One letter and five digits, e.g. A00000"
							ref={(el: HTMLInputElement) => {
								tagEl = el;
							}}
							value={assetTag.value()}
							onInput={(e) => {
								assetTag.set(e.currentTarget.value);
							}}
							onBlur={assetTag.flush}
							invalid={formError() !== undefined}
						/>
					</Show>
					<PropertyRow icon={ICONS.itemType} label="Type">
						<Select.Root
							options={typeOptions()}
							value={selectedType()}
							placeholder="Choose a type"
							sameWidth
							onValueChange={(d) => {
								typeId.set(
									d.value[0] as Id<"itemTypes"> | undefined
								);
							}}
						>
							<Select.Content>
								<For each={typeOptions()}>
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
					<Show when={props.item}>
						<Accordion.Root
							multiple
							value={openSections()}
							onValueChange={(details) => {
								setOpenSections(details.value);
							}}
						>
							<Accordion.Item value="qr">
								<Accordion.ItemTitle>
									QR &amp; link
								</Accordion.ItemTitle>
								<Accordion.ItemContent>
									<EntityQrBlock
										{...itemEntity.qr!(props.item!)}
									/>
								</Accordion.ItemContent>
							</Accordion.Item>
						</Accordion.Root>
					</Show>
				</Drawer.Body>
				<Show when={!props.loading && !isEdit()}>
					<Drawer.Footer>
						<Button
							disabled={
								!tagLooksValid() || typeId.value() === undefined
							}
							disabledReason="Add a valid asset tag and type first"
							onClick={() => {
								void createItem();
							}}
						>
							Create item
						</Button>
					</Drawer.Footer>
				</Show>
			</Drawer.Root>
			<CopyFromItemDialog
				open={copyOpen()}
				onOpenChange={setCopyOpen}
				items={props.items ?? []}
				onSelect={(source) => {
					const details = detailsFromItem(source);
					typeId.set(details.typeId);
					description.set(details.description);
				}}
			/>
		</>
	);
}
