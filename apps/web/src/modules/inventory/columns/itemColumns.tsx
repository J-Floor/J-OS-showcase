import { fieldColumn, type JfColumnDefinition } from "@j-os/design-system";

import { actionsColumnSize } from "../../community/columns/RowActions.tsx";
import type { Item } from "../data/inventoryData.ts";
import { itemFields } from "../fields.ts";

import { InventoryRowActions } from "./InventoryRowActions.tsx";
import { descriptionColumn } from "./sharedColumns.ts";
import { uniqueEnum } from "./uniqueEnum.ts";

export function itemColumns(rows: Item[]): JfColumnDefinition<Item>[] {
	return [
		fieldColumn(itemFields.assetTag, {
			accessorKey: "assetTag",
			dataType: "string",
		}),
		fieldColumn(itemFields.typeName, {
			accessorKey: "typeName",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((row) => row.typeName)),
		}),
		{
			accessorKey: "categoryName",
			header: "Category",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((row) => row.categoryName)),
		},
		descriptionColumn<Item>(itemFields.description),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(2),
			cell: (info) => <InventoryRowActions row={info.row.original} />,
		},
	];
}
