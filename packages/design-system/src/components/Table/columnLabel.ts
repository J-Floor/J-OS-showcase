import type { Column } from "@tanstack/solid-table";

/** The column's name for assistive tech: its header text, or its id when the
 *  header is empty or rendered by a function. */
export function columnLabel<Data extends Record<string, unknown>>(
	column: Column<Data>
): string {
	const header = column.columnDef.header;
	return typeof header === "string" && header !== "" ? header : column.id;
}
