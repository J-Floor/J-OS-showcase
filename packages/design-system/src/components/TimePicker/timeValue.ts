import {
	CalendarDateTime,
	DateFormatter,
	type DateValue,
	Time,
} from "@internationalized/date";

/** The smallest segment shown by the field. */
export type TimeGranularity = "minute" | "second";

// A `Time` is not a `DateValue`, but the zag date-input engine works in
// `DateValue[]`. We bridge through a fixed epoch date: every value the machine
// holds is this date plus a time-of-day. Because the date portion is constant,
// `min`/`max` (built the same way) compare purely on the time — and the date
// segments never render (the formatter only emits time segments).
const EPOCH_YEAR = 1970;
const EPOCH_MONTH = 1;
const EPOCH_DAY = 1;

/**
 * The placeholder value handed to the machine for an empty field. It fixes the
 * date portion to the epoch so committed values share a date with `min`/`max`.
 */
export const EPOCH_PLACEHOLDER = new CalendarDateTime(
	EPOCH_YEAR,
	EPOCH_MONTH,
	EPOCH_DAY,
	0,
	0,
	0
);

/** Builds the 24-hour, time-only formatter that drives the visible segments. */
export function buildTimeFormatter(
	locale: string,
	granularity: TimeGranularity
): DateFormatter {
	return new DateFormatter(locale, {
		hour: "2-digit",
		minute: "2-digit",
		...(granularity === "second" ? { second: "2-digit" } : {}),
		hourCycle: "h23",
		// MUST match the date-input machine's timeZone (default "UTC"). The
		// machine renders a segment via value.toDate(machineTZ) → formatter; if
		// the formatter used the local zone instead, every hour would shift by
		// the local UTC offset (e.g. typing 19 would display as 20).
		timeZone: "UTC",
	});
}

/**
 * Converts a {@link Time} into the epoch-dated `CalendarDateTime` the machine
 * stores. Seconds are dropped at minute granularity so the value never carries
 * a precision the field can't show or edit.
 */
export function timeToValue(
	time: Time,
	granularity: TimeGranularity
): CalendarDateTime {
	return new CalendarDateTime(
		EPOCH_YEAR,
		EPOCH_MONTH,
		EPOCH_DAY,
		time.hour,
		time.minute,
		granularity === "second" ? time.second : 0
	);
}

/**
 * Reads the time-of-day off a value committed by the machine, discarding the
 * (epoch) date portion. Returns `undefined` for a value without a time
 * component (a plain `CalendarDate`), which the time field never produces.
 */
export function valueToTime(value: DateValue): Time | undefined {
	if (!("hour" in value)) return undefined;
	return new Time(value.hour, value.minute, value.second);
}

/**
 * Whether a time-of-day sits within the optional `[min, max]` window. Bounds are
 * plain times of day compared directly. Used to mark the field invalid when an
 * out-of-range time is entered — we deliberately do NOT pass min/max to the
 * machine (that would silently clamp the value); instead we flag it invalid.
 */
export function isWithinWindow(value: Time, min?: Time, max?: Time): boolean {
	if (min && value.compare(min) < 0) return false;
	if (max && value.compare(max) > 0) return false;
	return true;
}

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parses a 24-hour `"HH:MM"` string (the public value shape) into a `Time`.
 * Returns `null` for a malformed or out-of-range string rather than throwing,
 * so a caller can treat it the same as "no value".
 */
export function parseHHMM(text: string): Time | null {
	const match = HHMM_PATTERN.exec(text);
	if (!match) return null;
	return new Time(Number(match[1]), Number(match[2]));
}

/** Formats a `Time` as a zero-padded 24-hour `"HH:MM"` string. */
export function formatHHMM(time: Time): string {
	const hour = String(time.hour).padStart(2, "0");
	const minute = String(time.minute).padStart(2, "0");
	return `${hour}:${minute}`;
}
