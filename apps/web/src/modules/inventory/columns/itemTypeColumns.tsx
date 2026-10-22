import { fieldColumn, type JfColumnDefinition } from "@j-os/design-system";

import type { ItemType } from "../data/inventoryData.ts";
import { itemTypeFields } from "../fields.ts";

import { descriptionColumn } from "./sharedColumns.ts";
import { uniqueEnum } from "./uniqueEnum.ts";

export function itemTypeColumns(
	rows: ItemType[]
): JfColumnDefinition<ItemType>[] {
	return [
		fieldColumn(itemTypeFields.name, {
			accessorKey: "name",
			dataType: "string",
		}),
		fieldColumn(itemTypeFields.categoryName, {
			accessorKey: "categoryName",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((row) => row.categoryName)),
		}),
		descriptionColumn<ItemType>(itemTypeFields.description),
	];
}
