import { fieldColumn, type JfColumnDefinition } from "@j-os/design-system";

import type { Category } from "../data/inventoryData.ts";
import { categoryFields } from "../fields.ts";

import { descriptionColumn } from "./sharedColumns.ts";

export function categoryColumns(): JfColumnDefinition<Category>[] {
	return [
		fieldColumn(categoryFields.name, {
			accessorKey: "name",
			dataType: "string",
		}),
		descriptionColumn<Category>(categoryFields.description),
	];
}
