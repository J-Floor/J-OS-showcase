import type { Row } from "@tanstack/solid-table";

/**
 * Number-equality filter. Empty/nullish filter values pass everything.
 *
 * Ported from EmboUI (`@tanstack/react-table` → `@tanstack/solid-table`).
 */
export function numberEqualsColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	const rowValue = row.getValue(columnId);
	if (filterValue === undefined || filterValue === null || filterValue === "")
		return true;

	const filterNum = Number(filterValue);
	const rowNum = Number(rowValue);
	if (isNaN(filterNum) || isNaN(rowNum)) return false;
	return rowNum === filterNum;
}

/**
 * Enum membership filter. Passes everything when the filter is empty or not an
 * array; otherwise the row's value must be among the selected ones.
 *
 * A cell may hold SEVERAL values — a person's verticals, a row's status flags —
 * in which case it matches when any one of them is selected, the way a tag
 * filter is expected to behave. Ported from EmboUI, which only handled scalars
 * and silently dropped every multi-valued row instead.
 */
export function enumIncludesColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	const rowValue = row.getValue(columnId);
	if (
		filterValue === undefined ||
		filterValue === null ||
		!Array.isArray(filterValue) ||
		filterValue.length === 0
	)
		return true;

	const candidates = Array.isArray(rowValue) ? rowValue : [rowValue];
	return candidates.some(
		(value) =>
			(typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean") &&
			filterValue.includes(String(value))
	);
}

/**
 * Case-insensitive substring filter for text columns. Empty/nullish filter
 * values pass everything.
 */
export function textContainsColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	if (filterValue === undefined || filterValue === null || filterValue === "")
		return true;

	const rowValue = row.getValue(columnId);
	if (rowValue === undefined || rowValue === null) return false;
	if (
		(typeof rowValue !== "string" &&
			typeof rowValue !== "number" &&
			typeof rowValue !== "boolean") ||
		(typeof filterValue !== "string" &&
			typeof filterValue !== "number" &&
			typeof filterValue !== "boolean")
	)
		return false;

	/* eslint-disable no-restricted-syntax -- case-insensitive filter matching is business logic, not UI text */
	return String(rowValue)
		.toLowerCase()
		.includes(String(filterValue).toLowerCase());
	/* eslint-enable no-restricted-syntax -- re-enable after the filter comparison */
}

/**
 * Inclusive timestamp-range filter for date columns. The filter value is a
 * `[from, to]` tuple of epoch-millisecond bounds; either bound may be
 * `null`/`undefined` to leave that side unbounded. An empty/absent filter
 * passes everything. The row value is coerced to a timestamp via `Number` (it
 * may be a number, a `Date`, or a date string).
 */
export function dateRangeColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	if (
		filterValue === undefined ||
		filterValue === null ||
		!Array.isArray(filterValue)
	)
		return true;

	const [fromRaw, toRaw] = filterValue as [unknown, unknown];
	const from =
		fromRaw === undefined || fromRaw === null || fromRaw === ""
			? undefined
			: Number(new Date(fromRaw as string | number));
	const to =
		toRaw === undefined || toRaw === null || toRaw === ""
			? undefined
			: Number(new Date(toRaw as string | number));
	if (from === undefined && to === undefined) return true;

	const rowValue = row.getValue(columnId);
	const ts = Number(new Date(rowValue as string | number));
	if (isNaN(ts)) return false;

	if (from !== undefined && !isNaN(from) && ts < from) return false;
	if (to !== undefined && !isNaN(to) && ts > to) return false;
	return true;
}
