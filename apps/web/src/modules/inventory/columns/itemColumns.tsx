import { type JfColumnDefinition } from "@j-os/design-system";

import { actionsColumnSize } from "../../community/columns/RowActions.tsx";
import type { Item } from "../data/inventoryData.ts";

import { InventoryRowActions } from "./InventoryRowActions.tsx";
import { descriptionColumn } from "./sharedColumns.ts";
import { uniqueEnum } from "./uniqueEnum.ts";

export function itemColumns(rows: Item[]): JfColumnDefinition<Item>[] {
	return [
		{
			accessorKey: "assetTag",
			header: "Asset tag",
			dataType: "string",
		},
		{
			accessorKey: "typeName",
			header: "Type",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((row) => row.typeName)),
		},
		{
			accessorKey: "categoryName",
			header: "Category",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((row) => row.categoryName)),
		},
		descriptionColumn<Item>(),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(2),
			cell: (info) => <InventoryRowActions row={info.row.original} />,
		},
	];
}
