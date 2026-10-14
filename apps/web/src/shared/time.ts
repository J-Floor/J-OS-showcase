/**
 * Time formatting shared across modules. Dependency-free (no date-fns /
 * Intl.RelativeTimeFormat plumbing).
 */

const mediumDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const shortDate = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
});

export const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_BEFORE_ABSOLUTE_DATE = 30;

function startOfDay(ms: number): Date {
	const date = new Date(ms);
	date.setHours(0, 0, 0, 0);
	return date;
}

/** "Today", "Yesterday", else a medium local date; one label per local day. */
export function dayLabel(at: number, now: number): string {
	const day = startOfDay(at);
	const today = startOfDay(now);
	if (day.getTime() === today.getTime()) return "Today";
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	return day.getTime() === yesterday.getTime()
		? "Yesterday"
		: mediumDate.format(day);
}

/**
 * Format a PAST timestamp (ms since epoch) as a compact "… ago" string: "just
 * now", "5m ago", "3h ago", "2d ago". Falls back to an absolute date once it is
 * more than a month old, where "43d ago" stops being easier to read than the day
 * itself.
 */
export function formatAgo(ms: number, nowMs = Date.now()): string {
	const diff = nowMs - ms;
	if (diff < MS_PER_MINUTE) return "just now";
	const minutes = Math.floor(diff / MS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) return `${String(minutes)}m ago`;
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	if (hours < HOURS_PER_DAY) return `${String(hours)}h ago`;
	const days = Math.floor(hours / HOURS_PER_DAY);
	return days < DAYS_BEFORE_ABSOLUTE_DATE
		? `${String(days)}d ago`
		: formatDate(ms);
}

/** Format an absolute timestamp (ms since epoch) as a short local date. */
export function formatDate(ms: number): string {
	return shortDate.format(new Date(ms));
}

/**
 * Format the time remaining until `untilMs` (an absolute timestamp in ms) as a
 * compact relative string: "3d", "5h", "12m", or "<1m". Returns "Expired" once
 * the timestamp is in the past.
 */
export function formatDistance(untilMs: number, nowMs = Date.now()): string {
	const diff = untilMs - nowMs;
	if (diff <= 0) return "Expired";
	const minutes = Math.floor(diff / MS_PER_MINUTE);
	if (minutes < 1) return "<1m";
	if (minutes < MINUTES_PER_HOUR) return `${String(minutes)}m`;
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	if (hours < HOURS_PER_DAY) return `${String(hours)}h`;
	const days = Math.floor(hours / HOURS_PER_DAY);
	return `${String(days)}d`;
}
