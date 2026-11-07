import {
	ACTIONS_COLUMN_ID,
	actionsColumnSize,
	type JfColumnDefinition,
} from "@j-os/design-system";

/**
 * A table's trailing row actions, to spread into its columns. `count` is the
 * most buttons any row can show this viewer. At 0 there is no column, so
 * whoever has no actions never gets an empty one. `disableRowClick`, so the
 * buttons never also open the row.
 */
export function actionsColumn<Row extends Record<string, unknown>>(options: {
	count: number;
	cell: JfColumnDefinition<Row>["cell"];
}): JfColumnDefinition<Row>[] {
	if (options.count === 0) return [];
	return [
		{
			id: ACTIONS_COLUMN_ID,
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(options.count),
			cell: options.cell,
		},
	];
}
