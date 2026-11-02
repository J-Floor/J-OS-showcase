import { Table } from "@j-os/design-system";
import { createEffect, on, onCleanup, type JSX } from "solid-js";

import { call } from "../../../lib/call.ts";
import { ActionButton } from "../../../shared/actions/ActionButton.tsx";
import type { ActionOutcome } from "../../../shared/actions/shortcuts.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { createItemColumns } from "../columns/itemColumns.tsx";
import type { Item } from "../data/inventoryData.ts";
import { useItemActions, useItems } from "../data/inventoryData.ts";
import { createItemBatchActions } from "../inventoryActions.ts";
import { printInventoryList } from "../print/printInventoryList.ts";
import { ItemSheet } from "../sheets/ItemSheet.tsx";

import { InventoryTab, type InventorySheetArgs } from "./InventoryTab.tsx";

/** The batch Delete: confirms once, removes each row, and keeps a failure for
 *  the batch bar, where the delete was asked for. */
function createBatchDelete() {
	const actions = useItemActions();
	const confirm = useConfirm();
	const { error, trackResult, clear } = createActionError();

	async function deleteRows(
		rows: Item[],
		clearSelection: () => void
	): Promise<ActionOutcome> {
		const isOk = await confirm({
			title: `Delete ${String(rows.length)} item(s)?`,
			message: "This can't be undone.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!isOk) return;
		for (const row of rows) {
			const result = await trackResult(
				call(
					actions.remove(row._id),
					"Could not delete the selected items."
				)
			);
			if (result.isErr()) return { refused: true };
		}
		clearSelection();
		return { refused: false };
	}

	return { error, clearError: clear, deleteRows };
}

/** The selection bar's Print and Delete, for the checked items, and their
 *  keys. Always mounted inside the table, so the keys and the page's count of
 *  checked rows follow the selection. */
function ItemBatch(props: {
	active: boolean;
	onSelectedCountChange?: (count: number) => void;
}): JSX.Element {
	const batch = Table.useSelection<Item>();
	const batchDelete = createBatchDelete();
	const { print, remove } = createItemBatchActions({
		rows: batch.rows,
		active: () => props.active,
		print: (rows) => {
			void printInventoryList(rows);
		},
		remove: (rows) => batchDelete.deleteRows(rows, batch.clear),
	});
	// A re-made selection starts without the old selection's failure.
	createEffect(
		on(
			() =>
				batch
					.rows()
					.map((row) => row._id)
					.join(),
			batchDelete.clearError
		)
	);
	createEffect(() => {
		props.onSelectedCountChange?.(batch.count());
	});
	onCleanup(() => {
		props.onSelectedCountChange?.(0);
	});

	return (
		<Table.BatchActions>
			<ActionButton action={print} target={batch.rows()} />
			<ActionButton
				action={remove}
				target={batch.rows()}
				variant="secondary"
			/>
			<InlineError message={batchDelete.error()} />
		</Table.BatchActions>
	);
}

export function ItemsTab(props: {
	selection: EntitySelection<Item>;
	newItemAssetTag?: () => string | undefined;
	/** The items tab is the one on screen: the batch keys are live only then. */
	active: boolean;
	/** Told how many rows are checked, so the page's Print list can step aside. */
	onSelectedCountChange?: (count: number) => void;
}): JSX.Element {
	const items = useItems();
	const columns = createItemColumns(() => items.data() ?? []);

	return (
		<InventoryTab.Root
			data={() => items.data()}
			columns={columns}
			selection={props.selection}
			newItemAssetTag={props.newItemAssetTag}
			enableRowSelection
			virtualize
		>
			<InventoryTab.Sheet<Item>>
				{(sheet: InventorySheetArgs<Item>) => (
					<ItemSheet
						open={sheet.open()}
						prebuild={sheet.prebuild()}
						onOpenChange={sheet.onOpenChange}
						item={sheet.row()}
						initialAssetTag={sheet.initialAssetTag()}
						loading={props.selection.loading()}
						nav={sheet.nav}
					/>
				)}
			</InventoryTab.Sheet>
			<ItemBatch
				active={props.active && !props.selection.open()}
				onSelectedCountChange={props.onSelectedCountChange}
			/>
		</InventoryTab.Root>
	);
}
