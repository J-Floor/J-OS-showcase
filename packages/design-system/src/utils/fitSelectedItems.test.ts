import { describe, expect, test } from "vitest";

import { fitSelectedItems } from "./fitSelectedItems.ts";

describe("fitSelectedItems", () => {
	test("shows all when they fit", () => {
		expect(fitSelectedItems([10, 10, 10], 100, 20).visibleCount).toBe(3);
	});
	test("keeps the most recent and reserves the badge when overflowing", () => {
		// total (30) > container (25), so the badge is reserved: from the end,
		// badge(4)+10+10=24<=25 fits, but a third 10 (34) does not.
		expect(fitSelectedItems([10, 10, 10], 25, 4).visibleCount).toBe(2);
	});
	test("always shows at least one, even if it overflows alone", () => {
		expect(fitSelectedItems([100], 20, 10).visibleCount).toBe(1);
	});
	test("empty selection shows none", () => {
		expect(fitSelectedItems([], 100, 10).visibleCount).toBe(0);
	});
});
