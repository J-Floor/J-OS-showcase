import type { Row } from "@tanstack/solid-table";

import {
	booleanEqualsColumnFilter,
	booleanFilter,
	booleanSegment,
	dateRangeColumnFilter,
	enumFilterValueFromIds,
	enumIncludesColumnFilter,
	enumOptionId,
	enumOptionLabel,
	enumOptionValues,
	exactFilter,
	filterIsActive,
	isEnumValue,
	numberRangeColumnFilter,
	rangeFilter,
	selectedEnumOptionIds,
	switchRangeMode,
	textContainsColumnFilter,
	timeRangeColumnFilter,
	type RangeFilterValue,
} from "./filter.ts";
import type { EnumOption, EnumValue } from "./types.ts";

// Minimal Row stub: the filters only ever call `getValue`, so we expose just
// that method and cast through `unknown` to the full Row shape.
function row(v: unknown): Row<Record<string, unknown>> {
	return { getValue: () => v } as unknown as Row<Record<string, unknown>>;
}

test("number filter: exact value", () => {
	expect(
		numberRangeColumnFilter(row(3), "n", { mode: "exact", value: "3" })
	).toBe(true);
	expect(
		numberRangeColumnFilter(row(3), "n", { mode: "exact", value: "4" })
	).toBe(false);
	expect(
		numberRangeColumnFilter(row(3), "n", {
			mode: "exact",
			value: undefined,
		})
	).toBe(true);
	expect(numberRangeColumnFilter(row(3), "n", undefined)).toBe(true);
});

/** A range filter from the inputs' text: an empty bound is open. */
function range(from: string, to: string): RangeFilterValue<string> {
	return {
		mode: "range",
		from: from === "" ? undefined : from,
		to: to === "" ? undefined : to,
	};
}

test("number filter: inclusive range with open bounds", () => {
	expect(numberRangeColumnFilter(row(5), "n", range("2", "5"))).toBe(true);
	expect(numberRangeColumnFilter(row(6), "n", range("2", "5"))).toBe(false);
	expect(numberRangeColumnFilter(row(1), "n", range("2", ""))).toBe(false);
	expect(numberRangeColumnFilter(row(9), "n", range("2", ""))).toBe(true);
	expect(numberRangeColumnFilter(row(9), "n", range("", ""))).toBe(true);
	expect(numberRangeColumnFilter(row("x"), "n", range("2", ""))).toBe(false);
});

const NOON_OCT_8 = new Date(2026, 9, 8, 12, 0).getTime();
const LATE_OCT_8 = new Date(2026, 9, 8, 23, 59).getTime();
const MIDNIGHT_OCT_9 = new Date(2026, 9, 9, 0, 0).getTime();

test("date filter: an exact day covers the whole local day", () => {
	const day = { mode: "exact", value: "2026-10-08" };
	expect(dateRangeColumnFilter(row(NOON_OCT_8), "d", day)).toBe(true);
	expect(dateRangeColumnFilter(row(LATE_OCT_8), "d", day)).toBe(true);
	expect(dateRangeColumnFilter(row(MIDNIGHT_OCT_9), "d", day)).toBe(false);
	expect(
		dateRangeColumnFilter(row(NOON_OCT_8), "d", {
			mode: "exact",
			value: undefined,
		})
	).toBe(true);
});

test("date filter: a range includes its end day and leaves empty bounds open", () => {
	expect(
		dateRangeColumnFilter(
			row(LATE_OCT_8),
			"d",
			range("2026-10-01", "2026-10-08")
		)
	).toBe(true);
	expect(
		dateRangeColumnFilter(
			row(MIDNIGHT_OCT_9),
			"d",
			range("2026-10-01", "2026-10-08")
		)
	).toBe(false);
	expect(
		dateRangeColumnFilter(row(NOON_OCT_8), "d", range("2026-10-09", ""))
	).toBe(false);
	expect(
		dateRangeColumnFilter(row(NOON_OCT_8), "d", range("", "2026-10-08"))
	).toBe(true);
	expect(dateRangeColumnFilter(row(NOON_OCT_8), "d", range("", ""))).toBe(
		true
	);
	expect(
		dateRangeColumnFilter(row(undefined), "d", range("2026-10-01", ""))
	).toBe(false);
});

test("time filter: exact and inclusive range", () => {
	expect(
		timeRangeColumnFilter(row("09:30"), "t", {
			mode: "exact",
			value: "09:30",
		})
	).toBe(true);
	expect(
		timeRangeColumnFilter(row("09:31"), "t", {
			mode: "exact",
			value: "09:30",
		})
	).toBe(false);
	expect(
		timeRangeColumnFilter(row("12:00"), "t", range("09:00", "12:00"))
	).toBe(true);
	expect(
		timeRangeColumnFilter(row("12:01"), "t", range("09:00", "12:00"))
	).toBe(false);
	expect(timeRangeColumnFilter(row("08:00"), "t", range("", "12:00"))).toBe(
		true
	);
	expect(timeRangeColumnFilter(row("08:00"), "t", range("", ""))).toBe(true);
});

test("boolean filter keeps rows equal to the filter", () => {
	expect(booleanEqualsColumnFilter(row(true), "b", true)).toBe(true);
	expect(booleanEqualsColumnFilter(row(false), "b", true)).toBe(false);
	expect(booleanEqualsColumnFilter(row(false), "b", false)).toBe(true);
	expect(booleanEqualsColumnFilter(row(false), "b", undefined)).toBe(true);
});

test("enum filter includes, on any of a multi-valued cell", () => {
	expect(enumIncludesColumnFilter(row("x"), "e", ["x", "y"])).toBe(true);
	expect(enumIncludesColumnFilter(row("z"), "e", ["x"])).toBe(false);
	expect(enumIncludesColumnFilter(row("x"), "e", [])).toBe(true);
	expect(enumIncludesColumnFilter(row(["z", "y"]), "e", ["y"])).toBe(true);
	expect(enumIncludesColumnFilter(row([]), "e", ["y"])).toBe(false);
	expect(enumIncludesColumnFilter(row(2), "e", [2])).toBe(true);
	expect(enumIncludesColumnFilter(row(true), "e", ["true"])).toBe(true);
});

test("text filter contains (case-insensitive)", () => {
	expect(textContainsColumnFilter(row("Alpha"), "t", "alp")).toBe(true);
	expect(textContainsColumnFilter(row("Alpha"), "t", "beta")).toBe(false);
	expect(textContainsColumnFilter(row("Alpha"), "t", "")).toBe(true);
});

const options: EnumOption<EnumValue>[] = [
	{ value: ["ok", "partial"], label: "Succeeded" },
	{ value: "failed", label: "Failed" },
];

test("an option covering several values is one entry", () => {
	expect(enumOptionValues(options[0])).toEqual(["ok", "partial"]);
	expect(enumOptionId(options[1])).toBe("failed");
	expect(enumFilterValueFromIds(options, [enumOptionId(options[0])])).toEqual(
		["ok", "partial"]
	);
	expect(selectedEnumOptionIds(options, ["ok", "partial"])).toEqual([
		enumOptionId(options[0]),
	]);
	// A partial set means the option was not what put those values there.
	expect(selectedEnumOptionIds(options, ["ok"])).toEqual([]);
	expect(selectedEnumOptionIds(options, undefined)).toEqual(
		options.map(enumOptionId)
	);
});

test("an empty range is not an active filter", () => {
	expect(filterIsActive("number", range("", ""))).toBe(false);
	expect(filterIsActive("number", range("2", ""))).toBe(true);
	expect(filterIsActive("date", range("", ""))).toBe(false);
	expect(filterIsActive("time", range("", "09:00"))).toBe(true);
	expect(filterIsActive("number", { mode: "exact", value: undefined })).toBe(
		false
	);
	expect(filterIsActive("number", { mode: "exact", value: "0" })).toBe(true);
	expect(filterIsActive("string", "")).toBe(false);
	expect(filterIsActive("string", undefined)).toBe(false);
	expect(filterIsActive("enum", ["x"])).toBe(true);
	expect(filterIsActive("boolean", false)).toBe(true);
});

test("an emptied value clears the filter", () => {
	expect(exactFilter(undefined)).toBeUndefined();
	expect(exactFilter("3")).toEqual({ mode: "exact", value: "3" });
	expect(rangeFilter(undefined, undefined)).toBeUndefined();
	expect(rangeFilter("1", undefined)).toEqual({
		mode: "range",
		from: "1",
		to: undefined,
	});
	expect(rangeFilter(undefined, "2026-10-08")).toEqual({
		mode: "range",
		from: undefined,
		to: "2026-10-08",
	});
});

test("switching mode carries the value across", () => {
	expect(switchRangeMode({ mode: "exact", value: "5" }, "range")).toEqual({
		mode: "range",
		from: undefined,
		to: "5",
	});
	expect(switchRangeMode(range("1", "5"), "exact")).toEqual({
		mode: "exact",
		value: "5",
	});
	expect(switchRangeMode(undefined, "range")).toEqual({
		mode: "range",
		from: undefined,
		to: undefined,
	});
	expect(switchRangeMode<string>(undefined, "exact")).toEqual({
		mode: "exact",
		value: undefined,
	});
});

test("the boolean segment round-trips the filter", () => {
	expect(booleanSegment(undefined)).toBe("any");
	expect(booleanSegment(true)).toBe("true");
	expect(booleanSegment(false)).toBe("false");
	expect(booleanFilter("any")).toBeUndefined();
	expect(booleanFilter("true")).toBe(true);
	expect(booleanFilter("false")).toBe(false);
	expect(booleanFilter(null)).toBeUndefined();
});

test("a missing or blank number never matches, not even 0", () => {
	for (const missing of [null, undefined, "", "  ", true, [5]]) {
		expect(
			numberRangeColumnFilter(row(missing), "n", {
				mode: "exact",
				value: "0",
			})
		).toBe(false);
		expect(
			numberRangeColumnFilter(row(missing), "n", range("-1", "1"))
		).toBe(false);
	}
	expect(
		numberRangeColumnFilter(row("0"), "n", { mode: "exact", value: "0" })
	).toBe(true);
});

test("an option label is found by any value it covers, else the key", () => {
	const options: EnumOption<EnumValue>[] = [
		{ value: ["a", "b"], label: "Ab" },
		{ value: 3, label: "Three" },
	];
	expect(enumOptionLabel(options, "b")).toBe("Ab");
	expect(enumOptionLabel(options, "3")).toBe("Three");
	expect(enumOptionLabel(options, "zzz")).toBe("zzz");
	expect(enumOptionLabel([], "x")).toBe("x");
});

test("isEnumValue accepts only strings, numbers and booleans", () => {
	expect(isEnumValue("x")).toBe(true);
	expect(isEnumValue(0)).toBe(true);
	expect(isEnumValue(false)).toBe(true);
	expect(isEnumValue(null)).toBe(false);
	expect(isEnumValue(["x"])).toBe(false);
});
