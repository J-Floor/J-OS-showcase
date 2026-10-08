import { type JfColumnDef } from "@j-os/design-system";

import type { ItemType } from "../data/inventoryData.ts";

import { DESCRIPTION_SIZE } from "./columnSizes.ts";
import { uniqueEnum } from "./uniqueEnum.ts";

export function itemTypeColumns(rows: ItemType[]): JfColumnDef<ItemType>[] {
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
	];
}
