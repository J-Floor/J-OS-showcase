// Day arithmetic for occupancy. A day runs 04:00 → 04:00 at the site, so the
// people who leave at 01:00 count in the day they arrived. Pure: no Convex.
import { parseDate, toCalendarDate } from "@internationalized/date";

import { SITE_TIMEZONE, composeZoned, pad, zonedFromEpoch } from "../time.ts";

export const DAY_START_HOUR = 4;

/** The `YYYY-MM-DD` of the site day containing `at`. Wall-clock, so a DST
 *  change does not move the boundary. */
export function dayKey(at: number): string {
	const zoned = zonedFromEpoch(at, SITE_TIMEZONE);
	const date =
		zoned.hour < DAY_START_HOUR ? zoned.subtract({ days: 1 }) : zoned;
	return toCalendarDate(date).toString();
}

/** When the site day after `day` starts. */
export function dayStartAfter(day: string): number {
	return composeZoned(
		parseDate(day).add({ days: 1 }).toString(),
		`${pad(DAY_START_HOUR)}:00`,
		SITE_TIMEZONE
	).utc;
}

/** A headcount the app can store: a whole number, never below zero. */
export function clampCount(count: number): number {
	return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

/** The site's wall-clock hour at `at`. */
export function zonedHour(at: number): number {
	return zonedFromEpoch(at, SITE_TIMEZONE).hour;
}
