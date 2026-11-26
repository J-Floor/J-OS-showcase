import { describe, expect, it } from "vitest";

import {
	rangeFromParameter,
	refreshedLabel,
	withShare,
} from "./analyticsView.ts";

const NOW = Date.UTC(2026, 10, 10, 12);
const MINUTE = 60_000;

describe("rangeFromParameter", () => {
	it("accepts 7, 30 and 90", () => {
		expect(rangeFromParameter("7")).toBe(7);
		expect(rangeFromParameter("30")).toBe(30);
		expect(rangeFromParameter("90")).toBe(90);
	});
	it("falls back to 30", () => {
		expect(rangeFromParameter(undefined)).toBe(30);
		expect(rangeFromParameter("12")).toBe(30);
		expect(rangeFromParameter(["7"])).toBe(30);
	});
});

describe("refreshedLabel", () => {
	it("says how long ago", () => {
		expect(refreshedLabel(undefined, NOW)).toBe("Not refreshed yet");
		expect(refreshedLabel(NOW - 20_000, NOW)).toBe("Refreshed just now");
		expect(refreshedLabel(NOW - 4 * MINUTE, NOW)).toBe("Refreshed 4m ago");
		expect(refreshedLabel(NOW - 125 * MINUTE, NOW)).toBe(
			"Refreshed 2h ago"
		);
		expect(refreshedLabel(NOW - 3 * 24 * 60 * MINUTE, NOW)).toBe(
			"Refreshed 3d ago"
		);
	});
});

describe("withShare", () => {
	it("adds each row's share of the total", () => {
		expect(withShare([{ label: "/", count: 30 }], 120)).toEqual([
			{ label: "/", count: 30, share: 0.25 },
		]);
		expect(withShare([{ label: "/", count: 30 }], 0)).toEqual([
			{ label: "/", count: 30, share: 0 },
		]);
	});
});
