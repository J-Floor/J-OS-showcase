import type { JSX } from "solid-js";

import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { createItemTypeColumns } from "../columns/itemTypeColumns.tsx";
import type { ItemType } from "../data/inventoryData.ts";
import { useCategories, useItemTypes } from "../data/inventoryData.ts";
import { itemTypeEntity } from "../entity.ts";
import { ItemTypeSheet } from "../sheets/ItemTypeSheet.tsx";

import { InventoryTab, type InventorySheetArgs } from "./InventoryTab.tsx";

export function ItemTypesTab(props: {
	selection: EntitySelection<ItemType>;
}): JSX.Element {
	const types = useItemTypes();
	const categories = useCategories();
	const columns = createItemTypeColumns(() => types.data() ?? []);
	return (
		<InventoryTab.Root
			data={() => types.data()}
			columns={columns}
			selection={props.selection}
			descriptor={itemTypeEntity}
		>
			<InventoryTab.Sheet<ItemType>>
				{(sheet: InventorySheetArgs<ItemType>) => (
					<ItemTypeSheet
						open={sheet.open()}
						prebuild={sheet.prebuild()}
						onOpenChange={sheet.onOpenChange}
						itemType={sheet.row()}
						categories={categories.data() ?? []}
						loading={props.selection.loading()}
						nav={sheet.nav}
					/>
				)}
			</InventoryTab.Sheet>
		</InventoryTab.Root>
	);
}
