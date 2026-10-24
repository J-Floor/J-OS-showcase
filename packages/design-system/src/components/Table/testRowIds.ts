/** `getRowId`s for Table tests: by an `id` field, or by index for fixed
 *  data that no test inserts into. */
export function rowId(row: { id: string }): string {
	return row.id;
}

export function rowIndex(_row: unknown, index: number): string {
	return String(index);
}
