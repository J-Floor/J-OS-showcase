import type { JSX } from "solid-js";

import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { itemTypeColumns } from "../columns/itemTypeColumns.tsx";
import type { ItemType } from "../data/inventoryData.ts";
import { useCategories, useItemTypes } from "../data/inventoryData.ts";
import { ItemTypeDrawer } from "../drawers/ItemTypeDrawer.tsx";

import { InventoryTab } from "./InventoryTab.tsx";

export function ItemTypesTab(props: {
	selection: EntitySelection<ItemType>;
}): JSX.Element {
	const types = useItemTypes();
	const categories = useCategories();
	return (
		<InventoryTab
			data={() => types.data()}
			columns={() => itemTypeColumns(types.data() ?? [])}
			selection={props.selection}
			renderDrawer={(d) => (
				<ItemTypeDrawer
					open={d.open()}
					onOpenChange={d.onOpenChange}
					itemType={d.row()}
					categories={categories.data() ?? []}
					loading={props.selection.loading()}
					nav={d.nav}
				/>
			)}
		/>
	);
}
