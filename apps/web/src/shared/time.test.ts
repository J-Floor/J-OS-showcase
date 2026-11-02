import { describe, expect, it } from "vitest";

import {
	dayLabel,
	formatAgo,
	formatDate,
	formatDateIn,
	formatDistance,
	formatMonthIn,
} from "./time.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("dayLabel", () => {
	const now = new Date(2026, 9, 4, 0, 5).getTime();

	it("labels today and yesterday around midnight", () => {
		expect(dayLabel(new Date(2026, 9, 4, 0, 1).getTime(), now)).toBe(
			"Today"
		);
		expect(dayLabel(new Date(2026, 9, 3, 23, 59).getTime(), now)).toBe(
			"Yesterday"
		);
	});

	it("gives older days a dated label, one per day", () => {
		const earlyLabel = dayLabel(new Date(2026, 8, 30, 1).getTime(), now);
		const lateLabel = dayLabel(new Date(2026, 8, 30, 23).getTime(), now);
		expect(earlyLabel).toBe(lateLabel);
		expect(earlyLabel).not.toBe("Yesterday");
		expect(earlyLabel).not.toBe(
			dayLabel(new Date(2026, 8, 29).getTime(), now)
		);
	});
});

describe("formatAgo", () => {
	const now = new Date(2026, 9, 4, 12, 0).getTime();

	it("counts up from a past time", () => {
		expect(formatAgo(now - 30_000, now)).toBe("just now");
		expect(formatAgo(now - 5 * MINUTE, now)).toBe("5m ago");
		expect(formatAgo(now - 3 * HOUR, now)).toBe("3h ago");
		expect(formatAgo(now - 2 * DAY, now)).toBe("2d ago");
	});

	it("falls back to the date once it is more than a month old", () => {
		const old = now - 45 * DAY;
		expect(formatAgo(old, now)).toBe(formatDate(old));
	});
});

describe("formatDistance", () => {
	const now = new Date(2026, 9, 4, 12, 0).getTime();

	it("says Expired once the time has passed", () => {
		expect(formatDistance(now, now)).toBe("Expired");
		expect(formatDistance(now - MINUTE, now)).toBe("Expired");
	});

	it("rounds down to the largest whole unit", () => {
		expect(formatDistance(now + 30_000, now)).toBe("<1m");
		expect(formatDistance(now + 12 * MINUTE, now)).toBe("12m");
		expect(formatDistance(now + 5 * HOUR + 59 * MINUTE, now)).toBe("5h");
		expect(formatDistance(now + 3 * DAY + 23 * HOUR, now)).toBe("3d");
	});
});

const LATE_EVENING_UTC = Date.UTC(2026, 0, 31, 23, 30); // 00:30 on 1 Feb in Zurich

describe("formatDateIn", () => {
	it("formats the day in the zone it is given, not the browser's", () => {
		expect(formatDateIn(LATE_EVENING_UTC, "Europe/Zurich")).toBe(
			new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeZone: "Europe/Zurich",
			}).format(LATE_EVENING_UTC)
		);
		expect(formatDateIn(LATE_EVENING_UTC, "Europe/Zurich")).not.toBe(
			formatDateIn(LATE_EVENING_UTC, "UTC")
		);
	});
});

describe("formatMonthIn", () => {
	it("names the month in the zone it is given", () => {
		expect(formatMonthIn(LATE_EVENING_UTC, "Europe/Zurich")).toBe(
			"February 2026"
		);
		expect(formatMonthIn(LATE_EVENING_UTC, "UTC")).toBe("January 2026");
	});
});
