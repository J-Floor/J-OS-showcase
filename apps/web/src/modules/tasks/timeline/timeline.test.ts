import { expect, test } from "vitest";

import type { Project } from "../data/tasksData.tsx";

import {
	buildTimeline,
	undatedProjects,
	DAY_WIDTH,
	type ViewMode,
} from "./timeline.ts";

// Minimal Project stub — only the fields buildTimeline reads matter; the rest
// are cast away (the function never touches them).
function proj(p: {
	_id: string;
	name: string;
	startDate?: number;
	endDate?: number;
}): Project {
	return { _creationTime: 0, createdBy: "u", ...p } as unknown as Project;
}

function ms(iso: string): number {
	return Date.parse(iso);
}
const WEEK: ViewMode = "week";

// Project spanning Wed 2026-06-10 .. Fri 2026-06-12.
const A = proj({
	_id: "a",
	name: "Alpha",
	startDate: ms("2026-06-10"),
	endDate: ms("2026-06-12"),
});

test("undatedProjects keeps only projects missing/!inverted dates", () => {
	const noStart = proj({ _id: "n1", name: "n1", endDate: ms("2026-06-10") });
	const noEnd = proj({ _id: "n2", name: "n2", startDate: ms("2026-06-10") });
	const inverted = proj({
		_id: "n3",
		name: "n3",
		startDate: ms("2026-06-12"),
		endDate: ms("2026-06-10"),
	});
	const result = undatedProjects([A, noStart, noEnd, inverted]);
	expect(result.map((p) => p._id)).toEqual(["n1", "n2", "n3"]);
});

test("buildTimeline returns null when nothing is fully dated", () => {
	const noEnd = proj({ _id: "n", name: "n", startDate: ms("2026-06-10") });
	expect(buildTimeline([noEnd], WEEK, ms("2026-06-15"))).toBeNull();
});

test("week mode: range snaps to Mondays, bar offset/span correct", () => {
	const t = buildTimeline([A], WEEK, ms("2026-06-15"));
	expect(t).not.toBeNull();
	if (!t) return;
	// pad 0: range = Mon 2026-06-08 .. end of maxEnd's week (Sun 2026-06-14) = 7d.
	expect(t.totalDays).toBe(7);
	expect(t.dayWidth).toBe(DAY_WIDTH.week);
	// Bar: 2026-06-10 is 2 days after 06-08; spans 3 days (10,11,12).
	expect(t.bars).toEqual([
		{
			id: "a",
			name: "Alpha",
			offset: 2,
			span: 3,
			startMs: ms("2026-06-10"),
			endMs: ms("2026-06-12"),
		},
	]);
	// One month band cell covering the whole (all-June) range.
	expect(t.months).toHaveLength(1);
	expect(t.months[0]).toMatchObject({
		label: "June 2026",
		offset: 0,
		span: 7,
	});
	// One weekly tick at the 06-08 week start.
	expect(t.ticks.map((x) => x.offset)).toEqual([0]);
	expect(t.ticks.map((x) => x.label)).toEqual(["8 Jun"]);
});

test("today marker: in-range gives an offset, out-of-range gives null", () => {
	const inRange = buildTimeline([A], WEEK, ms("2026-06-10"));
	expect(inRange?.todayOffset).toBe(2); // 06-10 is 2 days after 06-08
	const outOfRange = buildTimeline([A], WEEK, ms("2026-07-01"));
	expect(outOfRange?.todayOffset).toBeNull();
});

test("day mode: one tick per day across the range", () => {
	const t = buildTimeline([A], "day", ms("2026-06-10"));
	expect(t).not.toBeNull();
	if (!t) return;
	expect(t.totalDays).toBe(7);
	expect(t.ticks).toHaveLength(7);
	expect(t.ticks[0].label).toBe("8"); // 2026-06-08
});

test("month mode: full-month range, month band, no bottom ticks", () => {
	const t = buildTimeline([A], "month", ms("2026-06-15"));
	expect(t).not.toBeNull();
	if (!t) return;
	// Range = 2026-06-01 .. 2026-06-30 → 30 days.
	expect(t.totalDays).toBe(30);
	expect(t.ticks).toEqual([]);
	expect(t.months[0]).toMatchObject({
		label: "June 2026",
		offset: 0,
		span: 30,
	});
	// Bar starts 9 days into June.
	expect(t.bars[0]).toMatchObject({ offset: 9, span: 3 });
});

test("pad adds units each side and weekend flags appear in day mode", () => {
	// Base week range = 06-08..06-14 (7d); +1 week each side = 06-01..06-21 = 21d.
	const padded = buildTimeline([A], WEEK, ms("2026-06-15"), 1, 1);
	expect(padded?.totalDays).toBe(21);
	// Day-mode weekends: 06-08 is Monday (not weekend); 06-13 is Saturday.
	const day = buildTimeline([A], "day", ms("2026-06-15"));
	expect(day?.ticks[0].weekend).toBe(false); // Mon 06-08
	expect(day?.ticks[5].weekend).toBe(true); // Sat 06-13
});
