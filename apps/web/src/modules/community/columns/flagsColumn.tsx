import type { JfColumnDefinition } from "@j-os/design-system";

import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { FLAG_FILTER_OPTIONS, flagFilterValue } from "../status/copy.ts";
import { FlagsCell } from "../status/FlagsCell.tsx";

const FLAGS_COLUMN_SIZE = 240;

/**
 * The Flags column the Members and Guests tabs share.
 *
 * Exceptions only: the group header above the row already carries the tier and
 * stage. Filterable and sortable on the flag text, so "show me everyone with
 * something outstanding" is a column filter.
 */
export function flagsColumn<
	Row extends { status: PersonStatus },
>(): JfColumnDefinition<Row> {
	return {
		id: "flags",
		header: "Flags",
		dataType: "enum",
		// Ids, not labels: the filter compares stable values while the cell
		// renders the wording. A row may carry several, which the enum filter
		// now matches on any-of.
		enumOptions: FLAG_FILTER_OPTIONS,
		size: FLAGS_COLUMN_SIZE,
		accessorFn: (row) =>
			row.status.flags.map((flag) => flagFilterValue(flag)),
		cell: (info) => <FlagsCell status={info.row.original.status} />,
	};
}
