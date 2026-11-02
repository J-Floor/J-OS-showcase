import { createActionKeys } from "../../shared/actions/createActionKeys.ts";
import { bindPageKeys, newAction } from "../../shared/actions/sheetActions.tsx";
import {
	CREATE_TARGET,
	type ActionDescriptor,
	type ActionOutcome,
	type CreateTarget,
	type PageTarget,
} from "../../shared/actions/shortcuts.ts";
import { ICONS } from "../../shared/icons.ts";

import type { Item } from "./data/inventoryData.ts";
import type { InventoryTabKey } from "./inventoryTabs.ts";
import { printInventoryList } from "./print/printInventoryList.ts";

/** The page's keys: New item / type / category, Scan. */
const PAGE_SCOPE = "inventory";
/** Print list, on its own so a checked selection can hand `P` to the batch bar. */
const PRINT_SCOPE = "inventory-print";
/** The items table's selection bar: Print and Delete on the checked rows. */
const BATCH_SCOPE = "inventory-batch";
/** The item sheet's Copy from, on the create form. */
const COPY_SCOPE = "item-create";

/**
 * The page's actions and keys. Each one is live only on the tab whose toolbar
 * shows its button, and only while no sheet or scanner is open. Print list
 * (`P`) steps aside while rows are checked: the selection bar's Print takes
 * the key.
 */
export function createInventoryPageActions(options: {
	activeTab: () => InventoryTabKey;
	isOverlayOpen: () => boolean;
	itemRows: () => Item[] | undefined;
	selectedCount: () => number;
	openNewItem: () => void;
	openNewType: () => void;
	openNewCategory: () => void;
	openScanner: () => void;
}) {
	function onTab(tab: InventoryTabKey): () => boolean {
		return () => options.activeTab() === tab;
	}
	const newItem = newAction({
		noun: "item",
		can: onTab("items"),
		open: options.openNewItem,
	});
	const newType = newAction({
		noun: "item type",
		hotkey: "Y",
		can: onTab("types"),
		open: options.openNewType,
	});
	const newCategory = newAction({
		noun: "category",
		hotkey: "G",
		can: onTab("categories"),
		open: options.openNewCategory,
	});
	const scan: ActionDescriptor<PageTarget> = {
		id: "scan-qr",
		label: "Scan QR",
		icon: "qr_code_scanner",
		hotkey: "S",
		can: onTab("items"),
		run: () => {
			options.openScanner();
		},
	};
	const printList: ActionDescriptor<PageTarget> = {
		id: "print-list",
		label: "Print inventory list",
		icon: ICONS.print,
		hotkey: "P",
		can: () =>
			options.activeTab() === "items" &&
			(options.itemRows()?.length ?? 0) > 0,
		disabledReason: () =>
			options.itemRows() === undefined
				? "Loading items…"
				: "No items to print",
		// The whole list, in its query order (the PDF renderer does not sort).
		run: () => {
			void printInventoryList(options.itemRows() ?? []);
		},
	};

	bindPageKeys(
		PAGE_SCOPE,
		[newItem, newType, newCategory, scan],
		() => !options.isOverlayOpen()
	);
	bindPageKeys(
		PRINT_SCOPE,
		[printList],
		() => !options.isOverlayOpen() && options.selectedCount() === 0
	);
	return { newItem, newType, newCategory, scan, printList };
}

/**
 * The selection bar's Print (`P`) and Delete (`Delete`). The target is the
 * whole checked set, so a Delete asks once for all of them and a Print makes
 * one PDF.
 */
export function createItemBatchActions(options: {
	rows: () => Item[];
	/** The items tab is on screen and no sheet is open over it. */
	active: () => boolean;
	print: (rows: Item[]) => void;
	remove: (rows: Item[]) => Promise<ActionOutcome>;
}) {
	const print: ActionDescriptor<Item[]> = {
		id: "print-selected",
		label: "Print",
		icon: ICONS.print,
		hotkey: "P",
		can: (rows) => rows.length > 0,
		run: (rows) => {
			options.print(rows);
		},
	};
	const remove: ActionDescriptor<Item[]> = {
		id: "delete-selected",
		label: "Delete",
		icon: ICONS.delete,
		hotkey: "Delete",
		can: (rows) => rows.length > 0,
		run: (rows) => options.remove(rows),
	};
	createActionKeys<Item[]>({
		scope: BATCH_SCOPE,
		actions: () => [print, remove],
		target: () => {
			const rows = options.rows();
			return options.active() && rows.length > 0 ? rows : undefined;
		},
		active: options.active,
	});
	return { print, remove };
}

/** The create form's Copy from (`F`), keyed while the form is on screen.
 *  Bound inside the sheet, so it is quiet while its own dialog is open
 *  over it. */
export function createCopyFromKeys(options: {
	isFormOpen: () => boolean;
	hasItems: () => boolean;
	openDialog: () => void;
}): ActionDescriptor<CreateTarget> {
	const copy: ActionDescriptor<CreateTarget> = {
		id: "copy-from-item",
		label: "Copy from item",
		icon: ICONS.copy,
		hotkey: "F",
		can: options.hasItems,
		disabledReason: () => "No items to copy from yet",
		run: () => {
			options.openDialog();
		},
	};
	createActionKeys<CreateTarget>({
		scope: COPY_SCOPE,
		actions: () => [copy],
		target: () => (options.isFormOpen() ? CREATE_TARGET : undefined),
		active: options.isFormOpen,
	});
	return copy;
}
