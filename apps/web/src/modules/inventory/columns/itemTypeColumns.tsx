import {
	type EnumOption,
	fieldColumn,
	type JfColumnDefinition,
} from "@j-os/design-system";
import { type Accessor, createMemo } from "solid-js";

import type { ItemType } from "../data/inventoryData.ts";
import { itemTypeFields } from "../fields.ts";

import { descriptionColumn } from "./sharedColumns.ts";
import { createEnumOptions } from "./uniqueEnum.ts";

export function itemTypeColumns(options: {
	categories: EnumOption[];
}): JfColumnDefinition<ItemType>[] {
	return [
		fieldColumn(itemTypeFields.name, {
			accessorKey: "name",
			dataType: "string",
		}),
		fieldColumn(itemTypeFields.categoryName, {
			accessorKey: "categoryName",
			dataType: "enum",
			enumOptions: options.categories,
		}),
		descriptionColumn<ItemType>(itemTypeFields.description),
	];
}

/** The tab's columns, rebuilt only when the category filter's options
 *  change, not on every push of the rows. */
export function createItemTypeColumns(
	rows: Accessor<readonly ItemType[]>
): Accessor<JfColumnDefinition<ItemType>[]> {
	const categories = createEnumOptions(() =>
		rows().map((row) => row.categoryName)
	);
	const columns = createMemo(() =>
		itemTypeColumns({ categories: categories() })
	);
	return columns;
}
