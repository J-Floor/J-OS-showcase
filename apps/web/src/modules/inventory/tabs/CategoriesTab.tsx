import type { JSX } from "solid-js";

import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { categoryColumns } from "../columns/categoryColumns.tsx";
import type { Category } from "../data/inventoryData.ts";
import { useCategories } from "../data/inventoryData.ts";
import { CategoryDrawer } from "../drawers/CategoryDrawer.tsx";

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
			renderDrawer={(d) => (
				<CategoryDrawer
					open={d.open()}
					onOpenChange={d.onOpenChange}
					category={d.row()}
					loading={props.selection.loading()}
					nav={d.nav}
				/>
			)}
		/>
	);
}
