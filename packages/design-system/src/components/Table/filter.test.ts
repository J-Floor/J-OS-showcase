import type { Row } from "@tanstack/solid-table";

import {
	numberEqualsColumnFilter,
	enumIncludesColumnFilter,
	textContainsColumnFilter,
	dateRangeColumnFilter,
} from "./filter.ts";

// Minimal Row stub: the filters only ever call `getValue`, so we expose just
// that method and cast through `unknown` to the full Row shape.
function row(v: unknown): Row<Record<string, unknown>> {
	return { getValue: () => v } as unknown as Row<Record<string, unknown>>;
}

test("number filter equals", () => {
	expect(numberEqualsColumnFilter(row(3), "n", 3)).toBe(true);
	expect(numberEqualsColumnFilter(row(3), "n", 4)).toBe(false);
	expect(numberEqualsColumnFilter(row(3), "n", "")).toBe(true);
});

test("enum filter includes", () => {
	expect(enumIncludesColumnFilter(row("x"), "e", ["x", "y"])).toBe(true);
	expect(enumIncludesColumnFilter(row("z"), "e", ["x"])).toBe(false);
	expect(enumIncludesColumnFilter(row("x"), "e", [])).toBe(true);
});

test("text filter contains (case-insensitive)", () => {
	expect(textContainsColumnFilter(row("Alpha"), "t", "alp")).toBe(true);
	expect(textContainsColumnFilter(row("Alpha"), "t", "beta")).toBe(false);
	expect(textContainsColumnFilter(row("Alpha"), "t", "")).toBe(true);
});

test("date range filter between bounds", () => {
	const t = 1_000;
	expect(dateRangeColumnFilter(row(t), "d", [500, 1_500])).toBe(true);
	expect(dateRangeColumnFilter(row(t), "d", [1_100, 1_500])).toBe(false);
	expect(dateRangeColumnFilter(row(t), "d", [null, 1_500])).toBe(true);
	expect(dateRangeColumnFilter(row(t), "d", undefined)).toBe(true);
});
