import type { Row } from "@tanstack/solid-table";

import type { DataType, EnumOption, EnumValue } from "./types.ts";

/**
 * A number, date or time column's filter: one value, or an inclusive range
 * whose missing bound is open. `undefined` is the only empty value. Number
 * filters hold the input's text, date filters ISO `YYYY-MM-DD` days in local
 * time, and time filters 24-hour `HH:MM`.
 */
export type RangeFilterValue<T> =
	| { mode: "exact"; value: T | undefined }
	| { mode: "range"; from: T | undefined; to: T | undefined };

/** The two modes of a number, date or time filter. */
export type FilterMode = RangeFilterValue<unknown>["mode"];

/** A boolean filter's segment: no filter, or the value to keep. */
type BooleanSegment = "any" | "true" | "false";

export function isEnumValue(value: unknown): value is EnumValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

/** How a filter bound maps onto the row's scale: the least and the most a
 *  row may be to match that bound exactly. */
type BoundScale = {
	lower: (bound: string) => number;
	upper: (bound: string) => number;
};

/**
 * Whether a row's position on a scale passes a range filter. No filter, an
 * exact filter with no value, or a range with neither bound passes
 * everything; otherwise a row with no position (`NaN`) never matches.
 */
function matchesRange(
	position: number,
	filterValue: unknown,
	scale: BoundScale
): boolean {
	if (filterValue === undefined || filterValue === null) return true;
	const value = filterValue as RangeFilterValue<string>;
	const from = value.mode === "exact" ? value.value : value.from;
	const to = value.mode === "exact" ? value.value : value.to;
	if (from === undefined && to === undefined) return true;
	if (Number.isNaN(position)) return false;
	return (
		(from === undefined || position >= scale.lower(from)) &&
		(to === undefined || position <= scale.upper(to))
	);
}

/** A row value as a number, or `NaN` when it holds none: only a number or a
 *  non-blank string counts, so a missing value never reads as 0. */
function numericValue(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") return Number(value);
	return Number.NaN;
}

const NUMBER_SCALE: BoundScale = { lower: Number, upper: Number };

/**
 * Number filter: an exact value or an inclusive range.
 *
 * Ported from EmboUI (`@tanstack/react-table` → `@tanstack/solid-table`).
 */
export function numberRangeColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	return matchesRange(
		numericValue(row.getValue(columnId)),
		filterValue,
		NUMBER_SCALE
	);
}

/** Epoch ms of a row's date value: J floor date columns hold timestamps, but
 *  a `Date` or a date string coerces too. */
function timestampOf(value: unknown): number {
	if (
		typeof value === "number" ||
		typeof value === "string" ||
		value instanceof Date
	)
		return new Date(value).getTime();
	return Number.NaN;
}

/** Local midnight at the start of an ISO day. */
function dayStart(iso: string): number {
	return new Date(`${iso}T00:00:00`).getTime();
}

/** The last millisecond of an ISO day, local time. Built from the calendar,
 *  not by adding 24h, so a daylight-saving day still ends at midnight. */
function dayEnd(iso: string): number {
	const next = new Date(`${iso}T00:00:00`);
	next.setDate(next.getDate() + 1);
	return next.getTime() - 1;
}

const DATE_SCALE: BoundScale = { lower: dayStart, upper: dayEnd };

/**
 * Date filter over timestamp rows: an exact local day, or an inclusive range
 * of local days.
 *
 * Ported from EmboUI, which compares ISO strings. J floor date columns hold
 * epoch timestamps, so the row value is coerced and compared against the
 * day's local bounds.
 */
export function dateRangeColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	return matchesRange(
		timestampOf(row.getValue(columnId)),
		filterValue,
		DATE_SCALE
	);
}

function toMinutes(time: string): number {
	const [hours, minutes] = time.split(":").map(Number);
	return hours * 60 + minutes;
}

const TIME_SCALE: BoundScale = { lower: toMinutes, upper: toMinutes };

/**
 * Time filter over `HH:MM` rows: an exact time or an inclusive range.
 *
 * Ported from EmboUI.
 */
export function timeRangeColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	const value = row.getValue(columnId);
	return matchesRange(
		typeof value === "string" ? toMinutes(value) : Number.NaN,
		filterValue,
		TIME_SCALE
	);
}

/** Boolean filter: keeps rows whose value is the filter's. No filter, or one
 *  that is not a boolean, passes everything. */
export function booleanEqualsColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	if (typeof filterValue !== "boolean") return true;
	return row.getValue(columnId) === filterValue;
}

/**
 * Enum membership filter. Passes everything when the filter is empty or not an
 * array; otherwise the row's value must be among the selected ones. Both sides
 * compare as strings, so number and boolean options match.
 *
 * A cell may hold SEVERAL values — a person's verticals, a row's status flags —
 * in which case it matches when any one of them is selected, the way a tag
 * filter is expected to behave. EmboUI only handles scalars.
 */
export function enumIncludesColumnFilter<Data extends Record<string, unknown>>(
	row: Row<Data>,
	columnId: string,
	filterValue: unknown
): boolean {
	if (!Array.isArray(filterValue) || filterValue.length === 0) return true;

	const wanted = new Set(filterValue.filter(isEnumValue).map(String));
	const rowValue = row.getValue(columnId);
	const candidates: unknown[] = Array.isArray(rowValue)
		? rowValue
		: [rowValue];
	return candidates.some(
		(value) => isEnumValue(value) && wanted.has(String(value))
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
	if (!isEnumValue(rowValue) || !isEnumValue(filterValue)) return false;

	/* eslint-disable no-restricted-syntax -- case-insensitive filter matching is business logic, not UI text */
	return String(rowValue)
		.toLowerCase()
		.includes(String(filterValue).toLowerCase());
	/* eslint-enable no-restricted-syntax -- re-enable after the filter comparison */
}

/**
 * Separator for an option's identity. U+0000 cannot appear in a stringified
 * enum value in practice, and joining a one-element list yields the element
 * itself, so a single-value option's identity stays exactly `String(value)`.
 */
const ENUM_ID_SEPARATOR = "\u0000";

/** The raw values an option stands for, stringified. */
export function enumOptionValues(option: EnumOption<EnumValue>): string[] {
	const value = option.value;
	return (Array.isArray(value) ? value : [value]).map((entry) =>
		String(entry)
	);
}

/** A stable identity for an option, derived from every value it covers. */
export function enumOptionId(option: EnumOption<EnumValue>): string {
	return enumOptionValues(option).join(ENUM_ID_SEPARATOR);
}

/** The label of the option covering `key` (a stringified value), or the key
 *  itself when no option does. */
export function enumOptionLabel(
	options: readonly EnumOption<EnumValue>[],
	key: string
): string {
	return (
		options.find((option) => enumOptionValues(option).includes(key))
			?.label ?? key
	);
}

function enumLabel(
	options: readonly EnumOption<EnumValue>[],
	value: unknown
): string {
	return isEnumValue(value) ? enumOptionLabel(options, String(value)) : "";
}

/** The text an enum cell shows: the matching option's label, or the labels
 *  of an array value joined with ", ". */
export function enumCellText(
	options: readonly EnumOption<EnumValue>[],
	value: unknown
): string {
	return Array.isArray(value)
		? value
				.map((entry: unknown) => enumLabel(options, entry))
				.filter((label) => label !== "")
				.join(", ")
		: enumLabel(options, value);
}

/**
 * The options a stored filter value has selected, as identities. An option
 * counts as selected only when every value it covers is present. No filter
 * means no constraint, which the UI shows as everything ticked.
 */
export function selectedEnumOptionIds(
	options: readonly EnumOption<EnumValue>[],
	filterValue: unknown
): string[] {
	if (!Array.isArray(filterValue)) return options.map(enumOptionId);

	const present = new Set(filterValue.filter(isEnumValue).map(String));
	return options
		.filter((option) =>
			enumOptionValues(option).every((value) => present.has(value))
		)
		.map(enumOptionId);
}

/** The stored filter value for a set of selected options: every raw value
 *  they cover, flattened. */
export function enumFilterValueFromIds(
	options: readonly EnumOption<EnumValue>[],
	selectedIds: readonly string[]
): string[] {
	const selected = new Set(selectedIds);
	return options
		.filter((option) => selected.has(enumOptionId(option)))
		.flatMap(enumOptionValues);
}

/**
 * Whether a filter value constrains anything, which lights the trigger's
 * "active" pill. Switching a number, date or time filter to "range" stores an
 * empty range, a pass-all filter that must not read as active.
 *
 * Ported from EmboUI's `FilteringButton`.
 */
export function filterIsActive(
	dataType: DataType["dataType"] | undefined,
	value: unknown
): boolean {
	if (value === undefined || value === null) return false;
	switch (dataType) {
		case "number":
		case "time":
		case "date": {
			const range = value as RangeFilterValue<unknown>;
			return range.mode === "exact"
				? range.value !== undefined
				: range.from !== undefined || range.to !== undefined;
		}
		case "string":
			return value !== "";
		case "enum":
			return Array.isArray(value);
		case "boolean":
		case undefined:
			return true;
	}
}

/** An exact filter, or no filter when the value is empty. */
export function exactFilter<T>(
	value: T | undefined
): RangeFilterValue<T> | undefined {
	return value === undefined ? undefined : { mode: "exact", value };
}

/** A range filter, or no filter when both bounds are empty. */
export function rangeFilter<T>(
	from: T | undefined,
	to: T | undefined
): RangeFilterValue<T> | undefined {
	return from === undefined && to === undefined
		? undefined
		: { mode: "range", from, to };
}

/** Switch a filter's mode, carrying the value across: an exact value becomes
 *  the range's upper bound, and a range's upper bound the exact value. */
export function switchRangeMode<T>(
	current: RangeFilterValue<T> | undefined,
	mode: FilterMode
): RangeFilterValue<T> {
	return mode === "range"
		? {
				mode: "range",
				from: undefined,
				to: current?.mode === "exact" ? current.value : undefined,
			}
		: {
				mode: "exact",
				value: current?.mode === "range" ? current.to : undefined,
			};
}

/** The boolean segment a stored filter value shows. */
export function booleanSegment(value: unknown): BooleanSegment {
	if (value === true) return "true";
	if (value === false) return "false";
	return "any";
}

/** The stored filter value for a boolean segment. */
export function booleanFilter(segment: string | null): boolean | undefined {
	if (segment === "true") return true;
	if (segment === "false") return false;
	return undefined;
}
