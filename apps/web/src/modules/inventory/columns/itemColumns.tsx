import {
	actionsColumnSize,
	type EnumOption,
	fieldColumn,
	type JfColumnDefinition,
} from "@j-os/design-system";
import { type Accessor, createMemo } from "solid-js";

import type { Item } from "../data/inventoryData.ts";
import { itemFields } from "../fields.ts";

import { InventoryRowActions } from "./InventoryRowActions.tsx";
import { descriptionColumn } from "./sharedColumns.ts";
import { createEnumOptions } from "./uniqueEnum.ts";

const ITEM_ACTION_COUNT = 2;

export function itemColumns(options: {
	types: EnumOption[];
	categories: EnumOption[];
}): JfColumnDefinition<Item>[] {
	return [
		fieldColumn(itemFields.assetTag, {
			accessorKey: "assetTag",
			dataType: "string",
		}),
		fieldColumn(itemFields.typeName, {
			accessorKey: "typeName",
			dataType: "enum",
			enumOptions: options.types,
		}),
		fieldColumn(itemFields.categoryName, {
			accessorKey: "categoryName",
			dataType: "enum",
			enumOptions: options.categories,
		}),
		descriptionColumn<Item>(itemFields.description),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(ITEM_ACTION_COUNT),
			cell: (info) => <InventoryRowActions row={info.row.original} />,
		},
	];
}

/** The tab's columns, rebuilt only when the type or category filter's
 *  options change, not on every push of the rows. */
export function createItemColumns(
	rows: Accessor<readonly Item[]>
): Accessor<JfColumnDefinition<Item>[]> {
	const types = createEnumOptions(() => rows().map((row) => row.typeName));
	const categories = createEnumOptions(() =>
		rows().map((row) => row.categoryName)
	);
	const columns = createMemo(() =>
		itemColumns({ types: types(), categories: categories() })
	);
	return columns;
}
