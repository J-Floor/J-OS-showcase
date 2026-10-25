import type { JSX } from "solid-js";

import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { categoryColumns } from "../columns/categoryColumns.tsx";
import type { Category } from "../data/inventoryData.ts";
import { useCategories } from "../data/inventoryData.ts";
import { categoryEntity } from "../entity.ts";
import { CategorySheet } from "../sheets/CategorySheet.tsx";

import { InventoryTab, type InventorySheetArgs } from "./InventoryTab.tsx";

export function CategoriesTab(props: {
	selection: EntitySelection<Category>;
}): JSX.Element {
	const categories = useCategories();
	return (
		<InventoryTab.Root
			data={() => categories.data()}
			columns={() => categoryColumns()}
			selection={props.selection}
			descriptor={categoryEntity}
		>
			<InventoryTab.Sheet<Category>>
				{(sheet: InventorySheetArgs<Category>) => (
					<CategorySheet
						open={sheet.open()}
						prebuild={sheet.prebuild()}
						onOpenChange={sheet.onOpenChange}
						category={sheet.row()}
						loading={props.selection.loading()}
						nav={sheet.nav}
					/>
				)}
			</InventoryTab.Sheet>
		</InventoryTab.Root>
	);
}
