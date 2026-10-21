// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AttendanceDay } from "../../../../convex/occupancy.ts";

import {
	activeDaysThisMonth,
	attendanceRows,
	busiestThisMonth,
	usualPeakHour,
} from "./attendance.ts";

const NOW = Date.parse("2026-10-21T10:00:00Z");

function day(key: string, fields: Partial<AttendanceDay> = {}): AttendanceDay {
	return {
		day: key,
		peak: 0,
		peakAt: Date.parse(`${key}T12:00:00Z`),
		personMinutes: 0,
		...fields,
	};
}

describe("attendanceRows over 30 days", () => {
	it("gives one row per site day ending today, oldest first, zero-filled", () => {
		const { rows } = attendanceRows(
			[day("2026-10-21", { peak: 12, personMinutes: 600, entries: 30 })],
			"days",
			NOW
		);
		expect(rows).toHaveLength(30);
		expect(rows[29]).toEqual({
			label: "21",
			mostAtOnce: 12,
			walkIns: 30,
			hours: 10,
		});
		expect(rows[28]).toEqual({
			label: "20",
			mostAtOnce: 0,
			walkIns: 0,
			hours: 0,
		});
	});

	it("adds the short month on the first row and on each 1st", () => {
		const { rows } = attendanceRows([], "days", NOW);
		expect(rows[0]?.label).toBe("22 Sep");
		expect(rows[9]?.label).toBe("1 Oct");
		expect(rows[10]?.label).toBe("2");
	});

	it("matches rows by their day key and rounds hours to whole numbers", () => {
		const { rows } = attendanceRows(
			[day("2026-10-19", { peak: 3, personMinutes: 90 })],
			"days",
			NOW
		);
		expect(rows[27]).toMatchObject({
			label: "19",
			mostAtOnce: 3,
			hours: 2,
		});
	});

	it("ignores rows older than the window", () => {
		const { rows } = attendanceRows(
			[day("2026-09-21", { peak: 9, personMinutes: 600 })],
			"days",
			NOW
		);
		expect(rows.every((row) => row.mostAtOnce === 0)).toBe(true);
	});
});

describe("attendanceRows over 12 months", () => {
	it("gives twelve month rows labelled like the other charts", () => {
		const { rows } = attendanceRows([], "months", NOW);
		expect(rows).toHaveLength(12);
		expect(rows[0]?.label).toBe("Nov");
		expect(rows[2]?.label).toBe("Jan 26");
		expect(rows[11]?.label).toBe("Oct");
	});

	it("counts October as the newest month until 04:00 on the 1st in Zurich", () => {
		const days = [
			day("2026-10-05", { peak: 9 }),
			day("2026-11-01", { peak: 7 }),
		];
		const beforeFour = Date.parse("2026-11-01T00:30:00Z");
		const afterFour = Date.parse("2026-11-01T03:30:00Z");
		expect(attendanceRows([], "months", beforeFour).rows[11]?.label).toBe(
			"Oct"
		);
		expect(attendanceRows([], "months", afterFour).rows[11]?.label).toBe(
			"Nov"
		);
		expect(busiestThisMonth(days, beforeFour)).toBe(9);
		expect(activeDaysThisMonth(days, beforeFour)).toBe(1);
		expect(busiestThisMonth(days, afterFour)).toBe(7);
	});

	it("puts the year on January across a year boundary", () => {
		const { rows } = attendanceRows(
			[],
			"months",
			Date.parse("2027-01-15T10:00:00Z")
		);
		expect(rows[11]?.label).toBe("Jan 27");
		expect(rows[10]?.label).toBe("Dec");
		expect(rows[0]?.label).toBe("Feb");
	});

	it("averages peak over days with people, skipping empty days", () => {
		const { rows } = attendanceRows(
			[
				day("2026-10-01", { peak: 10, entries: 20 }),
				day("2026-10-02", { peak: 5, entries: 11 }),
				day("2026-10-03", { peak: 0, entries: 0 }),
			],
			"months",
			NOW
		);
		expect(rows[11]).toMatchObject({ mostAtOnce: 7.5, walkIns: 15.5 });
	});

	it("averages walk-ins only over days that recorded them", () => {
		const { rows } = attendanceRows(
			[
				day("2026-10-01", { peak: 4, entries: 9 }),
				day("2026-10-02", { peak: 5 }),
			],
			"months",
			NOW
		);
		expect(rows[11]).toMatchObject({ mostAtOnce: 4.5, walkIns: 9 });
	});

	it("rounds the means to one decimal", () => {
		const { rows } = attendanceRows(
			[
				day("2026-09-01", { peak: 1 }),
				day("2026-09-02", { peak: 1 }),
				day("2026-09-03", { peak: 2 }),
			],
			"months",
			NOW
		);
		expect(rows[10]?.mostAtOnce).toBeCloseTo(1.3, 5);
	});

	it("sums person-hours over the month and rounds to a whole number", () => {
		const { rows } = attendanceRows(
			[
				day("2026-09-10", { peak: 2, personMinutes: 100 }),
				day("2026-09-11", { peak: 3, personMinutes: 130 }),
				day("2026-08-30", { peak: 3, personMinutes: 60 }),
			],
			"months",
			NOW
		);
		expect(rows[10]?.hours).toBe(4);
		expect(rows[9]?.hours).toBe(1);
	});

	it("counts hours on days with a zero peak too", () => {
		const { rows } = attendanceRows(
			[day("2026-10-05", { peak: 0, personMinutes: 120 })],
			"months",
			NOW
		);
		expect(rows[11]).toMatchObject({ mostAtOnce: 0, hours: 2 });
	});
});

describe("hasEntries", () => {
	it("is false for count-only data", () => {
		expect(
			attendanceRows([day("2026-10-20", { peak: 4 })], "days", NOW)
				.hasEntries
		).toBe(false);
	});

	it("is true when a day in range recorded entries", () => {
		expect(
			attendanceRows(
				[day("2026-10-20", { peak: 4, entries: 0 })],
				"days",
				NOW
			).hasEntries
		).toBe(true);
	});

	it("only looks at the chosen range", () => {
		const old = [day("2026-03-02", { peak: 4, entries: 8 })];
		expect(attendanceRows(old, "days", NOW).hasEntries).toBe(false);
		expect(attendanceRows(old, "months", NOW).hasEntries).toBe(true);
	});
});

describe("busiestThisMonth", () => {
	it("is the highest peak this month", () => {
		expect(
			busiestThisMonth(
				[
					day("2026-10-02", { peak: 7 }),
					day("2026-10-09", { peak: 15 }),
					day("2026-09-30", { peak: 30 }),
				],
				NOW
			)
		).toBe(15);
	});

	it("is null when no day this month had anyone", () => {
		expect(
			busiestThisMonth(
				[
					day("2026-10-02", { peak: 0 }),
					day("2026-09-30", { peak: 30 }),
				],
				NOW
			)
		).toBeNull();
		expect(busiestThisMonth([], NOW)).toBeNull();
	});
});

function peakingAt(key: string, hourUtc: number): AttendanceDay {
	return day(key, {
		peak: 5,
		peakAt: Date.parse(`${key}T${String(hourUtc).padStart(2, "0")}:30:00Z`),
	});
}

describe("usualPeakHour", () => {
	it("is the median Zurich hour of the peaks, odd count", () => {
		// 08, 10, 12 UTC are 10, 12, 14 in Zurich (CEST).
		expect(
			usualPeakHour(
				[
					peakingAt("2026-10-18", 12),
					peakingAt("2026-10-19", 8),
					peakingAt("2026-10-20", 10),
				],
				NOW
			)
		).toBe(12);
	});

	it("takes the lower middle for an even count", () => {
		expect(
			usualPeakHour(
				[
					peakingAt("2026-10-17", 8),
					peakingAt("2026-10-18", 12),
					peakingAt("2026-10-19", 9),
					peakingAt("2026-10-20", 10),
				],
				NOW
			)
		).toBe(11);
	});

	it("ignores empty days and days older than 30", () => {
		expect(
			usualPeakHour(
				[
					peakingAt("2026-10-20", 10),
					day("2026-10-19", {
						peak: 0,
						peakAt: Date.parse("2026-10-19T05:00:00Z"),
					}),
					peakingAt("2026-09-10", 16),
				],
				NOW
			)
		).toBe(12);
	});

	it("is null when no day in range had anyone", () => {
		expect(usualPeakHour([], NOW)).toBeNull();
	});

	it("orders a post-midnight peak after the evening of the same site day", () => {
		// 21:30, 01:30 (after midnight, still the previous site day) and
		// 15:30: the middle is 21, not 15.
		expect(
			usualPeakHour(
				[
					day("2026-10-18", {
						peak: 5,
						peakAt: Date.parse("2026-10-18T19:30:00Z"),
					}),
					day("2026-10-19", {
						peak: 5,
						peakAt: Date.parse("2026-10-19T23:30:00Z"),
					}),
					day("2026-10-20", {
						peak: 5,
						peakAt: Date.parse("2026-10-20T13:30:00Z"),
					}),
				],
				NOW
			)
		).toBe(21);
	});
});

describe("activeDaysThisMonth", () => {
	it("counts days with at least five people at once", () => {
		expect(
			activeDaysThisMonth(
				[
					day("2026-10-01", { peak: 5 }),
					day("2026-10-02", { peak: 4 }),
					day("2026-10-03", { peak: 20 }),
					day("2026-09-30", { peak: 20 }),
				],
				NOW
			)
		).toBe(2);
	});
});
