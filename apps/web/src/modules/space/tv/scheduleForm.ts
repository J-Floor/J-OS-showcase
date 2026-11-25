import {
	SCHEDULE_DAYS,
	validateSchedule,
	type ScheduleDay,
	type ScheduleDayName,
} from "../../../../convex/lib/tv/schedule.ts";

export type DayMode = "always" | "hours" | "closed";

export type DayRow = {
	day: ScheduleDayName;
	mode: DayMode;
	on: string;
	off: string;
};

const DEFAULT_ON = "08:00";
const DEFAULT_OFF = "22:00";

function modeOf(entry: ScheduleDay | undefined): DayMode {
	if (entry === undefined) return "always";
	return entry.closed ? "closed" : "hours";
}

/** Seven rows, Monday first. A day the schedule does not name is always on. */
export function rowsFromSchedule(
	days: readonly ScheduleDay[] | undefined
): DayRow[] {
	return SCHEDULE_DAYS.map((day) => {
		const entry = days?.find((candidate) => candidate.day === day);
		return {
			day,
			mode: modeOf(entry),
			on: entry?.on ?? DEFAULT_ON,
			off: entry?.off ?? DEFAULT_OFF,
		};
	});
}

/** The schedule to save: "always" rows are left out. */
export function daysFromRows(rows: readonly DayRow[]): ScheduleDay[] {
	return rows.flatMap((entry): ScheduleDay[] => {
		if (entry.mode === "always") return [];
		if (entry.mode === "closed") return [{ day: entry.day, closed: true }];
		return [
			{ day: entry.day, closed: false, on: entry.on, off: entry.off },
		];
	});
}

/** Why the rows cannot be saved, or `undefined` when they can. */
export function rowsProblem(rows: readonly DayRow[]): string | undefined {
	const checked = validateSchedule(daysFromRows(rows));
	return checked.isErr() ? checked.error.message : undefined;
}
