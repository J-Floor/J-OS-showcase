export type DaySchedule = {
	closed: boolean;
	onMinute?: number;
	offMinute?: number;
};
/** Index 0 = Sunday ... 6 = Saturday (Date#getDay); undefined = always on. */
export type Schedule = readonly (DaySchedule | undefined)[];

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const KIB = 1024;
const MAX_KIB = 16;
const MAX_CHARS = MAX_KIB * KIB;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LOOKAHEAD_DAYS = 8;

function toMinute(value: string | null): number | undefined {
	const match = value === null ? null : TIME.exec(value);
	return match
		? Number(match[1]) * MINUTES_PER_HOUR + Number(match[2])
		: undefined;
}

function parseDay(element: Element): DaySchedule | undefined {
	if (element.getAttribute("off") === "all") return { closed: true };
	const onMinute = toMinute(element.getAttribute("on"));
	const offMinute = toMinute(element.getAttribute("off"));
	const isValid =
		onMinute !== undefined &&
		offMinute !== undefined &&
		onMinute < offMinute;
	return isValid ? { closed: false, onMinute, offMinute } : undefined;
}

function parseDays(root: Element): Map<number, DaySchedule> | undefined {
	const days = new Map<number, DaySchedule>();
	for (const element of Array.from(root.children)) {
		if (element.nodeName !== "day") return undefined;
		const index = DAY_NAMES.indexOf(element.getAttribute("name") ?? "");
		const day = parseDay(element);
		if (index < 0 || days.has(index) || !day) return undefined;
		days.set(index, day);
	}
	return days;
}

/**
 * undefined = malformed or oversized: the caller keeps the schedule it had.
 * The 16 KiB cap counts UTF-16 chars (String#length), not bytes.
 * `off="all"` wins: such a day is closed and any `on` is ignored.
 */
export function parseSchedule(xml: string): Schedule | undefined {
	if (xml.length > MAX_CHARS) return undefined;
	const document = new DOMParser().parseFromString(xml, "application/xml");
	const root = document.documentElement as Element | null;
	if (
		document.getElementsByTagName("parsererror").length > 0 ||
		root?.nodeName !== "schedule"
	)
		return undefined;
	const days = parseDays(root);
	return days && DAY_NAMES.map((_name, index) => days.get(index));
}

export function isOnAt(schedule: Schedule, at: Date): boolean {
	const entry = schedule[at.getDay()];
	if (!entry) return true;
	if (entry.closed) return false;
	const minute = at.getHours() * MINUTES_PER_HOUR + at.getMinutes();
	return (
		(entry.onMinute ?? 0) <= minute &&
		minute < (entry.offMinute ?? MINUTES_PER_DAY)
	);
}

/** Built from calendar fields, never by adding 24 h, so DST keeps wall-clock times. */
function atMinute(at: Date, offset: number, minuteOfDay: number): Date {
	return new Date(
		at.getFullYear(),
		at.getMonth(),
		at.getDate() + offset,
		Math.floor(minuteOfDay / MINUTES_PER_HOUR),
		minuteOfDay % MINUTES_PER_HOUR
	);
}

/** Epoch ms of the next on/off flip within 8 days, or undefined if none. */
export function nextChange(schedule: Schedule, at: Date): number | undefined {
	const wasOn = isOnAt(schedule, at);
	const candidates: Date[] = [];
	for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
		const midnight = atMinute(at, offset, 0);
		candidates.push(midnight);
		const entry = schedule[midnight.getDay()];
		for (const minute of [entry?.onMinute, entry?.offMinute]) {
			if (minute !== undefined)
				candidates.push(atMinute(at, offset, minute));
		}
	}
	candidates.sort((first, second) => first.getTime() - second.getTime());
	const next = candidates.find(
		(candidate) => candidate > at && isOnAt(schedule, candidate) !== wasOn
	);
	return next?.getTime();
}
