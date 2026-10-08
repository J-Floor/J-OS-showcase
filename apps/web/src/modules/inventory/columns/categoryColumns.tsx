import { type JfColumnDef } from "@j-os/design-system";

import type { Category } from "../data/inventoryData.ts";

import { DESCRIPTION_SIZE } from "./columnSizes.ts";

export function categoryColumns(): JfColumnDef<Category>[] {
	return [
		{
			accessorKey: "name",
			header: "Name",
			dataType: "string",
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
