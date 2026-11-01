import { expect, test } from "vitest";

import { formatValidUntil } from "./perkDate.ts";

test("a perk with no end date says so", () => {
	expect(formatValidUntil(undefined)).toBe("No end date");
});

test("an end date shows the stored calendar day, in the medium style", () => {
	const medium = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeZone: "UTC",
	});
	expect(formatValidUntil("2026-12-31")).toBe(
		medium.format(Date.UTC(2026, 11, 31))
	);
	expect(formatValidUntil("2027-01-01")).toBe(
		medium.format(Date.UTC(2027, 0, 1))
	);
});
