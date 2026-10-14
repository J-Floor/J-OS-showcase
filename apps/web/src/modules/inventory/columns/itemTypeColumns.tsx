import { type JfColumnDefinition } from "@j-os/design-system";

import type { ItemType } from "../data/inventoryData.ts";

import { descriptionColumn } from "./sharedColumns.ts";
import { uniqueEnum } from "./uniqueEnum.ts";

export function itemTypeColumns(
	rows: ItemType[]
): JfColumnDefinition<ItemType>[] {
	return [
		{
			accessorKey: "name",
			header: "Name",
			dataType: "string",
		},
		{
			accessorKey: "categoryName",
			header: "Category",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((row) => row.categoryName)),
		},
		descriptionColumn<ItemType>(),
	];
}
