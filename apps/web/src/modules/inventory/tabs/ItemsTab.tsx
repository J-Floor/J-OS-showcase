import {
	type BatchActionsRenderProps,
	Button,
	Icon,
} from "@j-os/design-system";
import { createEffect, on, type JSX } from "solid-js";

import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { itemColumns } from "../columns/itemColumns.tsx";
import type { Item } from "../data/inventoryData.ts";
import {
	useItemActions,
	useItemTypes,
	useItems,
} from "../data/inventoryData.ts";
import { printInventoryList } from "../print/printInventoryList.ts";
import { ItemSheet } from "../sheets/ItemSheet.tsx";

import { InventoryTab } from "./InventoryTab.tsx";

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

export function ItemsTab(props: {
	selection: EntitySelection<Item>;
	newItemAssetTag?: () => string | undefined;
}): JSX.Element {
	const items = useItems();
	const types = useItemTypes();
	const batchDelete = createBatchDelete();
	const { deleteRows } = batchDelete;

	function batchActions(batch: BatchActionsRenderProps<Item>): JSX.Element {
		// A re-made selection starts without the old selection's failure.
		createEffect(
			on(
				() => batch.selectedRows.map((row) => row._id).join(),
				batchDelete.clearError
			)
		);
		return (
			<>
				<Button
					onClick={() => {
						const selected = batch.selectedRows;
						void printInventoryList(selected);
					}}
				>
					<Icon>{ICONS.print}</Icon> Print
				</Button>
				<Button
					variant="secondary"
					onClick={() => {
						const selected = batch.selectedRows;
						void deleteRows(selected, batch.clearSelection);
					}}
				>
					<Icon>{ICONS.delete}</Icon> Delete
				</Button>
				<InlineError message={batchDelete.error()} />
			</>
		);
	}

	return (
		<InventoryTab
			data={() => items.data()}
			columns={() => itemColumns(items.data() ?? [])}
			selection={props.selection}
			newItemAssetTag={props.newItemAssetTag}
			enableRowSelection
			batchActions={batchActions}
			renderSheet={(sheet) => (
				<ItemSheet
					open={sheet.open()}
					onOpenChange={sheet.onOpenChange}
					item={sheet.row()}
					itemTypes={types.data() ?? []}
					items={items.data() ?? []}
					initialAssetTag={sheet.initialAssetTag()}
					loading={props.selection.loading()}
					nav={sheet.nav}
				/>
			)}
		/>
	);
}
