// @vitest-environment happy-dom
import { expect, test } from "vitest";

import type { PerkRow } from "../../../convex/perks.ts";

import { perkAvailability, perkColumns } from "./perkColumns.tsx";
import { formatValidUntil } from "./perkDate.ts";

// 11:00 in Zurich on 29 October 2026.
const NOW = Date.UTC(2026, 9, 29, 10);

function perk(validUntil: string | undefined): PerkRow {
	return {
		_id: "perk1",
		_creationTime: 0,
		partner: "Alpha Labs",
		title: "Cloud credits",
		terms: "Ask the board for the code.",
		category: "cloud",
		createdAt: 0,
		validUntil,
	} as PerkRow;
}

function column(key: string) {
	return perkColumns().find((candidate) => candidate.id === key);
}

test("the table groups by availability and shows perk, partner, category and end date", () => {
	expect(perkColumns().map((candidate) => candidate.id)).toEqual([
		"availability",
		"title",
		"partner",
		"category",
		"validUntil",
	]);
});

test("a perk is active through its last day in Zurich, and expired the day after", () => {
	expect(perkAvailability(perk("2026-10-29"), NOW)).toBe("active");
	expect(perkAvailability(perk("2026-10-28"), NOW)).toBe("expired");
});

test("a perk with no end date never expires", () => {
	expect(perkAvailability(perk(undefined), Date.UTC(2999, 0, 1))).toBe(
		"active"
	);
});

test("the end date column shows No end date or the day, and fits what it shows", () => {
	const validUntil = column("validUntil");
	expect(validUntil?.size).toBe("content");
	const measure = validUntil?.measureText;
	if (typeof measure !== "function")
		throw new Error("the end date column must measure the text it shows");
	expect(measure(perk(undefined))).toBe("No end date");
	expect(measure(perk("2026-12-31"))).toBe(formatValidUntil("2026-12-31"));
});

test("the category column names each category by its label", () => {
	const options = column("category")?.enumOptions;
	expect(options).toHaveLength(7);
	expect(options).toContainEqual({ value: "cloud", label: "Cloud" });
	expect(options).toContainEqual({ value: "hiring", label: "Hiring" });
});

test("the end date filters on the stored day, and an open-ended perk has none", () => {
	const validUntil = column("validUntil");
	const accessor =
		validUntil && "accessorFn" in validUntil
			? validUntil.accessorFn
			: undefined;
	if (typeof accessor !== "function")
		throw new Error(
			"the end date column must read the instant it filters on"
		);
	// Noon UTC: the stored day in every zone from UTC-11 to UTC+11. Midnight
	// would be the day before anywhere west of UTC.
	expect(accessor(perk("2026-12-31"), 0)).toBe(Date.UTC(2026, 11, 31, 12));
	expect(accessor(perk(undefined), 0)).toBeUndefined();
});
