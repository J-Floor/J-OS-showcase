import type { useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, on } from "solid-js";

import { createEntitySelection } from "../../shared/entity/createEntitySelection.ts";
import { slugOf } from "../../shared/entity/entityDescriptor.ts";
import { tabKeyOf } from "../../shared/tabKey.ts";

import type { Category, Item, ItemType } from "./data/inventoryData.ts";
import { categoryEntity, itemEntity, itemTypeEntity } from "./entity.ts";

export const TAB_KEYS = ["items", "types", "categories"] as const;

export type InventoryTabKey = (typeof TAB_KEYS)[number];

/** The tab `?tab=` names. A bogus value (a hand-edited or stale link) falls
 *  back to "items" instead of leaving every tab's selection inactive —
 *  matches Tasks/Community. */
export function activeInventoryTab(tab: unknown): InventoryTabKey {
	return tabKeyOf(TAB_KEYS, tab, "items");
}

type SetParams = ReturnType<typeof useSearchParams>[1];

/** Closes a tab's sheet the moment its tab stops being the active one. The
 *  user-click path (Tabs' `urlParam.set`) already closes all three, but a
 *  programmatic/command-palette navigation changes `?tab=` WITHOUT going
 *  through it — so the previous tab's sheet (a still-mounted Portal) would
 *  otherwise float over the newly opened one. Mirrors TasksTab/ProjectsTab. */
function closeWhenTabInactive(
	isActive: () => boolean,
	selection: { close: (shouldSyncUrl: boolean) => void }
) {
	createEffect(
		on(
			isActive,
			(isNowActive) => {
				if (!isNowActive) selection.close(false);
			},
			{ defer: true }
		)
	);
}

/**
 * One `createEntitySelection` per tab — the single source of the sheet's
 * open/close/current-row/URL state for that tab. `InventoryTab` consumes it
 * directly; there is no `requestOpenItem`/`requestNew` bridge. Item links use
 * the asset tag (not `_id`), which survives a reseed/re-import.
 */
export function createInventorySelections(options: {
	activeTab: () => InventoryTabKey;
	setParams: SetParams;
}) {
	const { activeTab, setParams } = options;
	const [newItemTag, setNewItemTag] = createSignal<string>();
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

	closeWhenTabInactive(() => activeTab() === itemEntity.tab, itemSelection);
	closeWhenTabInactive(
		() => activeTab() === itemTypeEntity.tab,
		typeSelection
	);
	closeWhenTabInactive(
		() => activeTab() === categoryEntity.tab,
		categorySelection
	);

	return {
		itemRows,
		newItemTag,
		/** Opens the create sheet, prefilled with `assetTag` when given. */
		openNewItem: (assetTag?: string): void => {
			// Order matters: set the prefill before opening so the sheet's
			// `key()` (which folds in `initialAssetTag`) settles in one flip.
			setNewItemTag(assetTag);
			itemSelection.openCreate();
		},
		itemSelection,
		typeSelection,
		categorySelection,
		/** The user picked a tab: closes all three sheets. */
		closeAll() {
			itemSelection.close(false);
			typeSelection.close(false);
			categorySelection.close(false);
		},
	};
}
