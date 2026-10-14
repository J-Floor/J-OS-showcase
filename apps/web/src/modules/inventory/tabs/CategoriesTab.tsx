import type { JSX } from "solid-js";

import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { categoryColumns } from "../columns/categoryColumns.tsx";
import type { Category } from "../data/inventoryData.ts";
import { useCategories } from "../data/inventoryData.ts";
import { CategoryDrawer } from "../drawers/CategoryDrawer.tsx";
import { categoryEntity } from "../entity.ts";

import { InventoryTab } from "./InventoryTab.tsx";

export function CategoriesTab(props: {
	selection: EntitySelection<Category>;
}): JSX.Element {
	const categories = useCategories();
	return (
		<InventoryTab
			data={() => categories.data()}
			columns={() => categoryColumns()}
			selection={props.selection}
			descriptor={categoryEntity}
			renderDrawer={(drawer) => (
				<CategoryDrawer
					open={drawer.open()}
					onOpenChange={drawer.onOpenChange}
					category={drawer.row()}
					loading={props.selection.loading()}
					nav={drawer.nav}
				/>
			)}
		/>
	);
}
