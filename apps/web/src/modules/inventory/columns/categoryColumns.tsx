import { type JfColumnDefinition } from "@j-os/design-system";

import type { Category } from "../data/inventoryData.ts";

import { descriptionColumn } from "./sharedColumns.ts";

export function categoryColumns(): JfColumnDefinition<Category>[] {
	return [
		{
			accessorKey: "name",
			header: "Name",
			dataType: "string",
		},
		descriptionColumn<Category>(),
	];
}
