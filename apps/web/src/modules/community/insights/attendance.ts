import { parseDate } from "@internationalized/date";
import type { ChartDatum } from "@j-os/design-system";

import {
	DAY_START_HOUR,
	dayKey,
	zonedHour,
} from "../../../../convex/lib/occupancy/accrual.ts";
import type { AttendanceDay } from "../../../../convex/occupancy.ts";

import { MONTH_NAMES, monthLabel } from "./metrics.ts";

/**
 * The Attendance section of the Insights tab, derived from one stored row per
 * site day (04:00 to 04:00). Pure, like `metrics.ts`: the numbers are claims
 * about the space, so each is a function of its inputs that a test can pin.
 */

/** A day counts as active when at least this many people were there at once. */
export const ACTIVE_DAY_MIN_PEOPLE = 5;
const RECENT_DAY_COUNT = 30;
const MONTH_COUNT = 12;

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const ONE_DECIMAL = 10;
const MONTH_KEY_LENGTH = 7;

export type AttendanceRange = "days" | "months";

type AttendanceRows = { rows: ChartDatum[]; hasEntries: boolean };

function roundTo(value: number, factor: number): number {
	return Math.round(value * factor) / factor;
}

function wholeHours(personMinutes: number): number {
	return Math.round(personMinutes / MINUTES_PER_HOUR);
}

function mean(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The `RECENT_DAY_COUNT` site days ending with today, oldest first. */
function recentDayKeys(now: number): string[] {
	const today = parseDate(dayKey(now));
	const keys: string[] = [];
	for (let back = RECENT_DAY_COUNT - 1; back >= 0; back--) {
		keys.push(today.subtract({ days: back }).toString());
	}
	return keys;
}

/** The `YYYY-MM` month of a `YYYY-MM-DD` day key. */
function monthOf(day: string): string {
	return day.slice(0, MONTH_KEY_LENGTH);
}

function axisDayLabel(key: string, isFirst: boolean): string {
	const date = parseDate(key);
	const dayOfMonth = String(date.day);
	return isFirst || date.day === 1
		? `${dayOfMonth} ${MONTH_NAMES[date.month - 1]}`
		: dayOfMonth;
}

function dailyRows(days: AttendanceDay[], now: number): AttendanceRows {
	const byDay = new Map(days.map((row) => [row.day, row]));
	const inRange = recentDayKeys(now).map((key) => ({
		key,
		row: byDay.get(key),
	}));
	return {
		rows: inRange.map(({ key, row }, index) => ({
			label: axisDayLabel(key, index === 0),
			mostAtOnce: row?.peak ?? 0,
			walkIns: row?.entries ?? 0,
			hours: wholeHours(row?.personMinutes ?? 0),
		})),
		hasEntries: inRange.some(({ row }) => row?.entries !== undefined),
	};
}

/** The `MONTH_COUNT` site months ending with the one containing today, oldest
 *  first, so the chart and the tiles agree on which month is current. */
function recentSiteMonths(now: number): { key: string; label: string }[] {
	const thisMonthStart = parseDate(dayKey(now)).set({ day: 1 });
	const months: { key: string; label: string }[] = [];
	for (let back = MONTH_COUNT - 1; back >= 0; back--) {
		const start = thisMonthStart.subtract({ months: back });
		months.push({
			key: monthOf(start.toString()),
			label: monthLabel(start.year, start.month),
		});
	}
	return months;
}

function monthlyRows(days: AttendanceDay[], now: number): AttendanceRows {
	const months = recentSiteMonths(now).map((month) => ({
		month,
		inMonth: days.filter((row) => monthOf(row.day) === month.key),
	}));
	return {
		rows: months.map(({ month, inMonth }) =>
			monthRow(month.label, inMonth)
		),
		hasEntries: months.some(({ inMonth }) =>
			inMonth.some((row) => row.entries !== undefined)
		),
	};
}

function monthRow(label: string, inMonth: AttendanceDay[]): ChartDatum {
	const withPeople = inMonth.filter((row) => row.peak > 0);
	const entries = withPeople.flatMap((row) =>
		row.entries === undefined ? [] : [row.entries]
	);
	const personMinutes = inMonth.reduce(
		(sum, row) => sum + row.personMinutes,
		0
	);
	return {
		label,
		mostAtOnce: roundTo(
			mean(withPeople.map((row) => row.peak)),
			ONE_DECIMAL
		),
		walkIns: roundTo(mean(entries), ONE_DECIMAL),
		hours: wholeHours(personMinutes),
	};
}

/** Chart rows for the chosen range, plus whether any day in it counted
 *  entries (count-only data has none, and the chart then omits walk-ins). */
export function attendanceRows(
	days: AttendanceDay[],
	range: AttendanceRange,
	now: number
): AttendanceRows {
	return range === "days" ? dailyRows(days, now) : monthlyRows(days, now);
}

function thisMonth(days: AttendanceDay[], now: number): AttendanceDay[] {
	const month = monthOf(dayKey(now));
	return days.filter((row) => monthOf(row.day) === month);
}

/** The highest number of people at once on any day this month; `null` when
 *  nobody was counted. */
export function busiestThisMonth(
	days: AttendanceDay[],
	now: number
): number | null {
	const peaks = thisMonth(days, now)
		.map((row) => row.peak)
		.filter((peak) => peak > 0);
	return peaks.length === 0 ? null : Math.max(...peaks);
}

/** Hours since the site day began, so a peak at 01:00 sorts after one at 22:00. */
function sinceDayStart(hour: number): number {
	return (hour - DAY_START_HOUR + HOURS_PER_DAY) % HOURS_PER_DAY;
}

/**
 * The median clock hour (site time) of each day's busiest moment over the last
 * `RECENT_DAY_COUNT` days; the lower middle when the count is even. `null`
 * when no such day had anyone.
 */
export function usualPeakHour(
	days: AttendanceDay[],
	now: number
): number | null {
	const recent = new Set(recentDayKeys(now));
	const offsets = days
		.filter((row) => row.peak > 0 && recent.has(row.day))
		.map((row) => sinceDayStart(zonedHour(row.peakAt)))
		.sort((first, second) => first - second);
	if (offsets.length === 0) return null;
	const median = offsets[Math.floor((offsets.length - 1) / 2)] ?? 0;
	return (median + DAY_START_HOUR) % HOURS_PER_DAY;
}

/** Days this month on which at least `ACTIVE_DAY_MIN_PEOPLE` were there at once. */
export function activeDaysThisMonth(
	days: AttendanceDay[],
	now: number
): number {
	return thisMonth(days, now).filter(
		(row) => row.peak >= ACTIVE_DAY_MIN_PEOPLE
	).length;
}
