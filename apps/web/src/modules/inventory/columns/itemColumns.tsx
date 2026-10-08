import { type JfColumnDef } from "@j-os/design-system";

import { actionsColumnSize } from "../../community/columns/RowActions.tsx";
import type { Item } from "../data/inventoryData.ts";

import { DESCRIPTION_SIZE } from "./columnSizes.ts";
import { InventoryRowActions } from "./InventoryRowActions.tsx";
import { uniqueEnum } from "./uniqueEnum.ts";

export function itemColumns(rows: Item[]): JfColumnDef<Item>[] {
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
			enumOptions: uniqueEnum(rows.map((r) => r.typeName)),
		},
		{
			accessorKey: "categoryName",
			header: "Category",
			dataType: "enum",
			enumOptions: uniqueEnum(rows.map((r) => r.categoryName)),
		},
		{
			id: "description",
			header: "Description",
			dataType: "string",
			size: DESCRIPTION_SIZE,
			measureText: false,
			accessorFn: (r) => r.description ?? "",
			cell: (info) => {
				const value = info.getValue() as string;
				return value === "" ? "—" : value;
			},
		},
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(2),
			cell: (info) => <InventoryRowActions row={info.row.original} />,
		},
	];
}
