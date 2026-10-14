import type { JfColumnDefinition } from "@j-os/design-system";

import { DESCRIPTION_SIZE } from "./columnSizes.ts";

/** The free-text description column every inventory table ends on; a dash
 *  stands in for an empty one. */
export function descriptionColumn<
	Row extends { description?: string },
>(): JfColumnDefinition<Row> {
	return {
		id: "description",
		header: "Description",
		dataType: "string",
		size: DESCRIPTION_SIZE,
		measureText: false,
		accessorFn: (row) => row.description ?? "",
		cell: (info) => {
			const value = info.getValue() as string;
			return value === "" ? "—" : value;
		},
	};
}
