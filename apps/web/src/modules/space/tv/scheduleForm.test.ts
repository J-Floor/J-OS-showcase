import { expect, test } from "vitest";

import {
	daysFromRows,
	rowsFromSchedule,
	rowsProblem,
	type DayRow,
} from "./scheduleForm.ts";

function row(rows: readonly DayRow[], day: string): DayRow {
	const found = rows.find((entry) => entry.day === day);
	if (!found) throw new Error(`no row for ${day}`);
	return found;
}

test("no schedule gives seven always-on rows, Monday first", () => {
	const rows = rowsFromSchedule(undefined);
	expect(rows.map((entry) => entry.day)).toEqual([
		"mon",
		"tue",
		"wed",
		"thu",
		"fri",
		"sat",
		"sun",
	]);
	expect(rows.every((entry) => entry.mode === "always")).toBe(true);
	expect(rows[0]).toMatchObject({ on: "08:00", off: "22:00" });
});

test("a schedule round-trips and omits the always-on days", () => {
	const days = [
		{ day: "mon", closed: false, on: "09:30", off: "17:00" },
		{ day: "sat", closed: true },
	] as const;
	const rows = rowsFromSchedule(days);
	expect(row(rows, "mon")).toEqual({
		day: "mon",
		mode: "hours",
		on: "09:30",
		off: "17:00",
	});
	expect(row(rows, "sat").mode).toBe("closed");
	expect(row(rows, "tue").mode).toBe("always");
	expect(daysFromRows(rows)).toEqual(days);
});

test("rowsProblem names a bad hours row and accepts a good form", () => {
	const rows = rowsFromSchedule(undefined).map((entry) =>
		entry.day === "tue"
			? { ...entry, mode: "hours" as const, on: "22:00", off: "08:00" }
			: entry
	);
	expect(rowsProblem(rows)).toBe("tue: on must be before off");
	expect(rowsProblem(rowsFromSchedule(undefined))).toBeUndefined();
	expect(
		rowsProblem(
			rowsFromSchedule([
				{ day: "mon", closed: false, on: "08:00", off: "20:00" },
			])
		)
	).toBeUndefined();
});
