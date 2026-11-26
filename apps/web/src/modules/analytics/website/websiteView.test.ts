import { describe, expect, it } from "vitest";

import {
	countryName,
	failureNotice,
	isStale,
	sampleNotice,
	topLabel,
	viewsPerVisit,
} from "./websiteView.ts";

const NOW = Date.UTC(2026, 10, 10, 12);
const MINUTE = 60_000;

describe("isStale", () => {
	it("is stale when never fetched or older than 15 minutes", () => {
		expect(isStale(undefined, NOW)).toBe(true);
		expect(isStale(NOW - 16 * MINUTE, NOW)).toBe(true);
		expect(isStale(NOW - 14 * MINUTE, NOW)).toBe(false);
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
