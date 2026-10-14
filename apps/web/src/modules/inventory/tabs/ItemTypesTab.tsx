import type { JSX } from "solid-js";

import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { itemTypeColumns } from "../columns/itemTypeColumns.tsx";
import type { ItemType } from "../data/inventoryData.ts";
import { useCategories, useItemTypes } from "../data/inventoryData.ts";
import { ItemTypeDrawer } from "../drawers/ItemTypeDrawer.tsx";
import { itemTypeEntity } from "../entity.ts";

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
			descriptor={itemTypeEntity}
			renderDrawer={(drawer) => (
				<ItemTypeDrawer
					open={drawer.open()}
					onOpenChange={drawer.onOpenChange}
					itemType={drawer.row()}
					categories={categories.data() ?? []}
					loading={props.selection.loading()}
					nav={drawer.nav}
				/>
			)}
		/>
	);
}
