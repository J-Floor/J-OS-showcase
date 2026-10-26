import { Button, Icon, Table } from "@j-os/design-system";
import { createEffect, on, type JSX } from "solid-js";

import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { createItemColumns } from "../columns/itemColumns.tsx";
import type { Item } from "../data/inventoryData.ts";
import { useItemActions, useItems } from "../data/inventoryData.ts";
import { printInventoryList } from "../print/printInventoryList.ts";
import { ItemSheet } from "../sheets/ItemSheet.tsx";

import { InventoryTab, type InventorySheetArgs } from "./InventoryTab.tsx";

/** The batch Delete: confirms, removes each row, and keeps a failure for the
 *  batch bar, where the delete was asked for. */
function createBatchDelete() {
	const actions = useItemActions();
	const confirm = useConfirm();
	const { error, trackResult, clear } = createActionError();

	async function deleteRows(
		rows: Item[],
		clearSelection: () => void
	): Promise<void> {
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
			if (result.isErr()) return;
		}
		clearSelection();
	}

	return { error, clearError: clear, deleteRows };
}

/** The selection bar's Print and Delete, for the checked items. */
function ItemBatchActions(): JSX.Element {
	const batch = Table.useSelection<Item>();
	const batchDelete = createBatchDelete();
	const { deleteRows } = batchDelete;
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

	return (
		<>
			<Button
				onClick={() => {
					const selected = batch.rows();
					void printInventoryList(selected);
				}}
			>
				<Icon>{ICONS.print}</Icon> Print
			</Button>
			<Button
				variant="secondary"
				onClick={() => {
					const selected = batch.rows();
					void deleteRows(selected, batch.clear);
				}}
			>
				<Icon>{ICONS.delete}</Icon> Delete
			</Button>
			<InlineError message={batchDelete.error()} />
		</>
	);
}

export function ItemsTab(props: {
	selection: EntitySelection<Item>;
	newItemAssetTag?: () => string | undefined;
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
			<Table.BatchActions>
				<ItemBatchActions />
			</Table.BatchActions>
		</InventoryTab.Root>
	);
}
