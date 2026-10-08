import { expect, test } from "vitest";

import { daysLeft } from "./countdown.ts";

const DAY = 86_400_000;

test("rounds partial days up", () => {
	expect(daysLeft(1_000 + 3.5 * DAY, 1_000)).toBe(4);
});

test("is zero at expiry and never negative", () => {
	expect(daysLeft(1_000, 1_000)).toBe(0);
	expect(daysLeft(1_000 - 5 * DAY, 1_000)).toBe(0);
});
