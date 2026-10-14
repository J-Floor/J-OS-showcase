import type { JfColumnDefinition } from "@j-os/design-system";

import { formatDate } from "../../../shared/time.ts";

/** The "Joined" date column the Members and Guests tabs share: when the
 *  person's row was created. */
export function joinedColumn<
	Row extends { _creationTime: number },
>(): JfColumnDefinition<Row> {
	return {
		id: "joinedAt",
		header: "Joined",
		dataType: "date",
		size: "content",
		accessorFn: (row) => row._creationTime,
		cell: (info) => formatDate(info.row.original._creationTime),
		measureText: (row) => formatDate(row._creationTime),
	};
}
