import { expect, test } from "vitest";

import { clampCount, dayKey, dayStartAfter, zonedHour } from "./accrual.ts";

const HOUR = 3_600_000;

test("dayKey: 03:59 Zurich belongs to the previous day, 04:00 to the new one", () => {
	// 2026-10-21 is CEST (UTC+2): 03:59 local = 01:59Z, 04:00 local = 02:00Z.
	expect(dayKey(Date.parse("2026-10-21T01:59:00Z"))).toBe("2026-10-20");
	expect(dayKey(Date.parse("2026-10-21T02:00:00Z"))).toBe("2026-10-21");
});

test("dayKey: 01:00 Zurich leaving counts for the day that started the evening before", () => {
	expect(dayKey(Date.parse("2026-10-21T23:00:00Z"))).toBe("2026-10-21"); // 01:00 on the 22nd local
});

test("dayStartAfter is 04:00 Zurich the next day, across a DST change", () => {
	// DST ends 2026-10-25: the 26th is CET (UTC+1).
	expect(dayStartAfter("2026-10-25")).toBe(
		Date.parse("2026-10-26T03:00:00Z")
	);
	expect(dayStartAfter("2026-10-21")).toBe(
		Date.parse("2026-10-22T02:00:00Z")
	);
});

test("a site day is 25 hours over the autumn change", () => {
	// DST ends 2026-10-25 at 03:00: the day of the 24th runs from 04:00 CEST
	// (02:00Z) to 04:00 CET on the 25th (03:00Z).
	expect(dayStartAfter("2026-10-24") - dayStartAfter("2026-10-23")).toBe(
		25 * HOUR
	);
});

test("a site day is 23 hours over the spring change", () => {
	// DST starts 2026-03-29 at 02:00: the day of the 28th runs from 04:00 CET
	// (03:00Z) to 04:00 CEST on the 29th (02:00Z).
	expect(dayStartAfter("2026-03-28") - dayStartAfter("2026-03-27")).toBe(
		23 * HOUR
	);
});

test("dayKey: the repeated and the skipped hour stay in the day they belong to", () => {
	// 2026-10-25 02:30 local happens twice (00:30Z CEST, 01:30Z CET).
	expect(dayKey(Date.parse("2026-10-25T00:30:00Z"))).toBe("2026-10-24");
	expect(dayKey(Date.parse("2026-10-25T01:30:00Z"))).toBe("2026-10-24");
	// 2026-03-29 jumps from 02:00 to 03:00 local at 01:00Z.
	expect(dayKey(Date.parse("2026-03-29T01:00:00Z"))).toBe("2026-03-28");
	expect(dayKey(Date.parse("2026-03-29T02:00:00Z"))).toBe("2026-03-29");
});

test("clampCount floors at zero and rounds", () => {
	expect(clampCount(-1)).toBe(0);
	expect(clampCount(Number.NaN)).toBe(0);
	expect(clampCount(3.4)).toBe(3);
	expect(clampCount(Number.POSITIVE_INFINITY)).toBe(0);
	expect(clampCount(Number.NEGATIVE_INFINITY)).toBe(0);
});

test("zonedHour reads the Zurich wall clock", () => {
	expect(zonedHour(Date.parse("2026-10-21T12:30:00Z"))).toBe(14);
});
