import {
	type BatchActionsRenderProps,
	Button,
	Icon,
} from "@j-os/design-system";
import type { JSX } from "solid-js";

import { useConfirm } from "../../../shared/confirm.tsx";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { ICONS } from "../../../shared/icons.ts";
import { itemColumns } from "../columns/itemColumns.tsx";
import type { Item } from "../data/inventoryData.ts";
import {
	useItemActions,
	useItemTypes,
	useItems,
} from "../data/inventoryData.ts";
import { ItemDrawer } from "../drawers/ItemDrawer.tsx";
import { printInventoryList } from "../print/printInventoryList.ts";

import { InventoryTab } from "./InventoryTab.tsx";

export function ItemsTab(props: {
	selection: EntitySelection<Item>;
	newItemAssetTag?: () => string | undefined;
}): JSX.Element {
	const items = useItems();
	const types = useItemTypes();
	const actions = useItemActions();
	const confirm = useConfirm();

	async function deleteRows(
		rows: Item[],
		clearSelection: () => void
	): Promise<void> {
		const ok = await confirm({
			title: `Delete ${String(rows.length)} item(s)?`,
			message: "This can't be undone.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!ok) return;
		for (const row of rows) {
			await actions.remove(row._id);
		}
		clearSelection();
	}

	function batchActions(p: BatchActionsRenderProps<Item>): JSX.Element {
		return (
			<>
				<Button
					onClick={() => {
						const selected = p.selectedRows;
						void printInventoryList(selected);
					}}
				>
					<Icon>{ICONS.print}</Icon> Print
				</Button>
				<Button
					variant="secondary"
					onClick={() => {
						const selected = p.selectedRows;
						void deleteRows(selected, p.clearSelection);
					}}
				>
					<Icon>{ICONS.delete}</Icon> Delete
				</Button>
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
			renderDrawer={(d) => (
				<ItemDrawer
					open={d.open()}
					onOpenChange={d.onOpenChange}
					item={d.row()}
					itemTypes={types.data() ?? []}
					items={items.data() ?? []}
					initialAssetTag={d.initialAssetTag()}
					loading={props.selection.loading()}
					nav={d.nav}
				/>
			)}
		/>
	);
}
