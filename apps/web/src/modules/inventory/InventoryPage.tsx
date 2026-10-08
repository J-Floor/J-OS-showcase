import {
	Button,
	Icon,
	IconButton,
	PermissionDenied,
	Tabs,
} from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, on } from "solid-js";

import { Can } from "../../lib/ability.tsx";
import { createEntitySelection } from "../../shared/entity/createEntitySelection.ts";
import { slugOf } from "../../shared/entity/entityDescriptor.ts";
import { ICONS } from "../../shared/icons.ts";

import type { Category, Item, ItemType } from "./data/inventoryData.ts";
import { useLookupItemByAssetTag } from "./data/inventoryData.ts";
import { categoryEntity, itemEntity, itemTypeEntity } from "./entity.ts";
import styles from "./InventoryPage.module.scss";
import { printInventoryList } from "./print/printInventoryList.ts";
import { QrScannerDialog } from "./scan/QrScannerDialog.tsx";
import { resolveScannedTag } from "./scan/resolveScannedTag.ts";
import { CategoriesTab } from "./tabs/CategoriesTab.tsx";
import { ItemsTab } from "./tabs/ItemsTab.tsx";
import { ItemTypesTab } from "./tabs/ItemTypesTab.tsx";

const TAB_KEYS = ["items", "types", "categories"] as const;

const INVALID_QR = "This QR isn't an asset tag (expected e.g. A00000).";

/** Board/admin inventory console: items, types, and categories. */
export function InventoryPage() {
	const [params, setParams] = useSearchParams();
	const [newItemTag, setNewItemTag] = createSignal<string>();
	const [scanOpen, setScanOpen] = createSignal(false);
	const [scanError, setScanError] = createSignal<string>();
	const [unknownTag, setUnknownTag] = createSignal<string>();
	const lookup = useLookupItemByAssetTag();
	let scanBusy = false;

	function activeTab(): (typeof TAB_KEYS)[number] {
		// Validate against the known tabs so a bogus `?tab=` (a hand-edited or
		// stale link) falls back to "items" instead of leaving every tab's
		// selection inactive — matches Tasks/Community.
		const tab = params.tab;
		return typeof tab === "string" &&
			(TAB_KEYS as readonly string[]).includes(tab)
			? (tab as (typeof TAB_KEYS)[number])
			: "items";
	}

	// One `createEntitySelection` per tab — the single source of the drawer's
	// open/close/current-row/URL state for that tab. `InventoryTab` consumes it
	// directly; there is no `requestOpenItem`/`requestNew` bridge. Item links use
	// the asset tag (not `_id`), which survives a reseed/re-import.
	const itemRows = itemEntity.useRows();
	const itemSelection = createEntitySelection<Item>({
		rows: itemRows,
		param: itemEntity.param,
		active: () => activeTab() === itemEntity.tab,
		slugOf: (row) => slugOf(itemEntity, row),
		// Switch to this tab for the inbound `?item=`, but keep that param —
		// clear only the OTHER two tabs' stale link params, and `replace` so the
		// tab switch doesn't stack a history entry (matches Tasks' onNeedTab).
		onNeedTab: () => {
			setParams(
				{ tab: itemEntity.tab, type: undefined, category: undefined },
				{ replace: true }
			);
		},
	});
	const typeSelection = createEntitySelection<ItemType>({
		rows: itemTypeEntity.useRows(),
		param: itemTypeEntity.param,
		active: () => activeTab() === itemTypeEntity.tab,
		slugOf: (row) => slugOf(itemTypeEntity, row),
		onNeedTab: () => {
			setParams(
				{
					tab: itemTypeEntity.tab,
					item: undefined,
					category: undefined,
				},
				{ replace: true }
			);
		},
	});
	const categorySelection = createEntitySelection<Category>({
		rows: categoryEntity.useRows(),
		param: categoryEntity.param,
		active: () => activeTab() === categoryEntity.tab,
		slugOf: (row) => slugOf(categoryEntity, row),
		onNeedTab: () => {
			setParams(
				{ tab: categoryEntity.tab, item: undefined, type: undefined },
				{ replace: true }
			);
		},
	});

	// Close a tab's drawer the moment its tab stops being the active one. The
	// user-click path (Tabs' `urlParam.set` below) already closes all three, but
	// a programmatic/command-palette navigation changes `?tab=` WITHOUT going
	// through it — so the previous tab's drawer (a still-mounted Portal) would
	// otherwise float over the newly opened one. Mirrors TasksTab/ProjectsTab.
	createEffect(
		on(
			() => activeTab() === itemEntity.tab,
			(isActive) => {
				if (!isActive) itemSelection.close(false);
			},
			{ defer: true }
		)
	);
	createEffect(
		on(
			() => activeTab() === itemTypeEntity.tab,
			(isActive) => {
				if (!isActive) typeSelection.close(false);
			},
			{ defer: true }
		)
	);
	createEffect(
		on(
			() => activeTab() === categoryEntity.tab,
			(isActive) => {
				if (!isActive) categorySelection.close(false);
			},
			{ defer: true }
		)
	);

	function openNewItem(assetTag?: string) {
		// Order matters: set the prefill before opening so the drawer's `key()`
		// (which folds in `initialAssetTag`) settles in one flip.
		setNewItemTag(assetTag);
		itemSelection.openCreate();
	}

	function printAllItems() {
		// Prints the whole list in its query order (the PDF renderer does not
		// sort). The batch action in ItemsTab prints only the checked rows; this
		// toolbar button is the "print everything" shortcut.
		void printInventoryList(itemRows() ?? []);
	}

	function closeScanner() {
		scanBusy = false;
		setScanOpen(false);
		setScanError(undefined);
		setUnknownTag(undefined);
	}

	function openScanner() {
		scanBusy = false;
		setScanError(undefined);
		setUnknownTag(undefined);
		setScanOpen(true);
	}

	async function onDetect(raw: string) {
		if (scanBusy) return;
		scanBusy = true;
		try {
			const result = await resolveScannedTag(raw, lookup);
			if (result.kind === "invalid") {
				setScanError(INVALID_QR);
				scanBusy = false;
				return;
			}
			if (result.kind === "open") {
				closeScanner();
				const row = itemRows()?.find((r) => r._id === result.id);
				if (row) {
					itemSelection.openRow(row);
				} else {
					// Lookup confirmed the item exists server-side but our own
					// subscription hasn't caught up yet — write the URL param
					// directly and let the selection's inbound effect open it
					// once the row is in `itemRows()`.
					setParams(
						{ tab: "items", item: result.assetTag },
						{ replace: true }
					);
				}
				return;
			}
			setScanError(undefined);
			setUnknownTag(result.assetTag);
		} catch {
			setScanError("Could not look up that asset tag.");
			scanBusy = false;
		}
	}

	return (
		<Can I="view" the="Inventory" fallback={<PermissionDenied />}>
			<Tabs.Root
				class={styles.console}
				lazyMount
				urlParam={{
					get: () => params.tab,
					set: (v) => {
						// Only ever called for a tab the USER picked (zag emits
						// `onValueChange` from its own events, never from a
						// controlled value change). All three tabs stay mounted
						// once visited, so an open drawer is a Portal floating
						// over whatever tab is now on screen — close it. And
						// clear all three link params explicitly: a selection's
						// own `close()` only writes the URL while it is still the
						// active tab, so the other two would otherwise keep a
						// stale `?type=`/`?category=` that silently reopens the
						// wrong drawer when the user switches back to them.
						itemSelection.close(false);
						typeSelection.close(false);
						categorySelection.close(false);
						setParams({
							tab: v,
							item: undefined,
							type: undefined,
							category: undefined,
						});
					},
					fallback: "items",
					keys: TAB_KEYS,
				}}
			>
				<div class={styles.tabBar}>
					<Tabs.List>
						<Tabs.Trigger value="items">Items</Tabs.Trigger>
						<Tabs.Trigger value="types">Item types</Tabs.Trigger>
						<Tabs.Trigger value="categories">
							Categories
						</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Actions value="items">
						<div class={styles.actions}>
							<IconButton
								tooltipLabel="Print inventory list"
								disabled={(itemRows()?.length ?? 0) === 0}
								disabledReason={
									itemRows() === undefined
										? "Loading items…"
										: "No items to print"
								}
								onClick={printAllItems}
							>
								{ICONS.print}
							</IconButton>
							<Button variant="secondary" onClick={openScanner}>
								<Icon>qr_code_scanner</Icon> Scan QR
							</Button>
							<Button
								onClick={() => {
									openNewItem();
								}}
							>
								<Icon>{ICONS.add}</Icon> New item
							</Button>
						</div>
					</Tabs.Actions>
					<Tabs.Actions value="types">
						<Button
							onClick={() => {
								typeSelection.openCreate();
							}}
						>
							<Icon>{ICONS.add}</Icon> New item type
						</Button>
					</Tabs.Actions>
					<Tabs.Actions value="categories">
						<Button
							onClick={() => {
								categorySelection.openCreate();
							}}
						>
							<Icon>{ICONS.add}</Icon> New category
						</Button>
					</Tabs.Actions>
				</div>
				<Tabs.Content value="items" class={styles.panel}>
					<ItemsTab
						selection={itemSelection}
						newItemAssetTag={newItemTag}
					/>
				</Tabs.Content>
				<Tabs.Content value="types" class={styles.panel}>
					<ItemTypesTab selection={typeSelection} />
				</Tabs.Content>
				<Tabs.Content value="categories" class={styles.panel}>
					<CategoriesTab selection={categorySelection} />
				</Tabs.Content>
			</Tabs.Root>
			<QrScannerDialog
				open={scanOpen()}
				onOpenChange={(open) => {
					if (open) setScanOpen(true);
					else closeScanner();
				}}
				onDetect={(raw) => {
					void onDetect(raw);
				}}
				error={scanError()}
				unknownTag={unknownTag()}
				onCancelUnknown={closeScanner}
				onAddUnknown={() => {
					const tag = unknownTag();
					closeScanner();
					if (tag !== undefined) openNewItem(tag);
				}}
			/>
		</Can>
	);
}
