import { describe, expect, it } from "vitest";

import {
	countryName,
	failureNotice,
	isStale,
	rangeFromParameter,
	refreshedLabel,
	sampleNotice,
	topLabel,
	viewsPerVisit,
	withShare,
} from "./websiteView.ts";

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

describe("isStale", () => {
	it("is stale when never fetched or older than 15 minutes", () => {
		expect(isStale(undefined, NOW)).toBe(true);
		expect(isStale(NOW - 16 * MINUTE, NOW)).toBe(true);
		expect(isStale(NOW - 14 * MINUTE, NOW)).toBe(false);
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

describe("failureNotice", () => {
	it("is undefined when the last attempt succeeded", () => {
		expect(failureNotice(null, NOW)).toBeUndefined();
		expect(
			failureNotice(
				{
					fetchedAt: NOW,
					lastError: { at: NOW - MINUTE, kind: "network" },
				},
				NOW
			)
		).toBeUndefined();
	});
	it("names the reason and the age of the data shown", () => {
		expect(
			failureNotice(
				{
					fetchedAt: NOW - 120 * MINUTE,
					lastError: { at: NOW, kind: "rateLimited" },
				},
				NOW
			)
		).toBe("Couldn't refresh (rate limit). Showing data from 2h ago.");
	});
	it("has no age when nothing was ever fetched", () => {
		expect(
			failureNotice({ lastError: { at: NOW, kind: "unauthorized" } }, NOW)
		).toBe("Couldn't refresh (access denied).");
	});
});

describe("viewsPerVisit", () => {
	it("rounds to one decimal, dash when no visits", () => {
		expect(viewsPerVisit({ views: 120, visits: 80 })).toBe("1.5");
		expect(viewsPerVisit({ views: 0, visits: 0 })).toBe("—");
	});
});

describe("topLabel", () => {
	it("is the first row's label or a dash", () => {
		expect(topLabel([{ label: "Switzerland", count: 3 }])).toBe(
			"Switzerland"
		);
		expect(topLabel([])).toBe("—");
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

describe("countryName", () => {
	it("names an ISO region code", () => {
		expect(countryName("CH")).toBe("Switzerland");
	});
	it("returns anything that is not a region unchanged", () => {
		expect(countryName("Unknown")).toBe("Unknown");
	});
});

describe("sampleNotice", () => {
	it("says how many page views were sampled per one counted", () => {
		expect(sampleNotice(10)).toContain("1 in 10 page views");
	});
	it("stays silent for exact counts and a missing interval", () => {
		expect(sampleNotice(1)).toBeUndefined();
		expect(sampleNotice(undefined)).toBeUndefined();
	});
});
