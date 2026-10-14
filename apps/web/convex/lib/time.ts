import {
	CalendarDateTime,
	parseAbsolute,
	parseZonedDateTime,
	toZoned,
	type ZonedDateTime,
} from "@internationalized/date";

/** The one site today. Multi-site later: supply per-site (it already lives inside each IXDTF value). */
export const SITE_TIMEZONE = "Europe/Zurich";
const LOCALE = "en-GB";
export const ISO_DATE_LENGTH = 10;

/** A zoned value: IXDTF source of truth + cached UTC epoch (ms). */
export type ZonedValue = {
	local: string;
	utc: number;
};

export function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** The zoned wall-clock a UTC epoch (ms) lands on, observed at `timeZone`. */
export function zonedFromEpoch(ms: number, timeZone: string): ZonedDateTime {
	return parseAbsolute(new Date(ms).toISOString(), timeZone);
}
function zdtToValue(zoned: ZonedDateTime): ZonedValue {
	return { local: zoned.toString(), utc: zoned.toDate().getTime() };
}
// Parse a stored IXDTF string, tolerant of a tzdata rule change.
// `parseZonedDateTime` honours the embedded offset exactly — which correctly
// disambiguates a DST fall-back overlap time — but THROWS if that offset no
// longer matches the zone's current rules. So try it first (the normal case,
// and it preserves an overlap instant exactly); only when it throws (a stored
// value whose offset a tzdata change invalidated) do we strip the offset and
// re-derive the wall-clock+zone under current rules, which never throws.
function parseLocalLoose(local: string): ZonedDateTime {
	try {
		return parseZonedDateTime(local);
	} catch {
		return parseZonedDateTime(
			local.replace(/[+-]\d{2}:\d{2}(?=\[)/, ""),
			"compatible"
		);
	}
}

// --- Zoned instants -------------------------------------------------------
export function composeZoned(
	dateIso: string,
	timeHHMM: string,
	timeZone: string
): ZonedValue {
	const [year, month, day] = dateIso.split("-").map(Number);
	const [hour, min] = timeHHMM.split(":").map(Number);
	return zdtToValue(
		toZoned(
			new CalendarDateTime(year, month, day, hour, min),
			timeZone,
			"compatible"
		)
	);
}
/** Cached epoch from a stored IXDTF string. */
export function utcFromLocal(local: string): number {
	return parseLocalLoose(local).toDate().getTime();
}
/** Inverse of `utcFromLocal`: the `timeZone`-zoned IXDTF string for a stored
 * epoch. Used to derive/self-heal a `*Local` field from an already-authoritative
 * cached epoch (e.g. a legacy row written before zoned locals existed). */
export function zonedLocalFromEpoch(ms: number, timeZone: string): string {
	return zonedFromEpoch(ms, timeZone).toString();
}
export function zonedDate(local: string): string {
	const zoned = parseLocalLoose(local);
	return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}`;
}
export function zonedTime(local: string): string {
	const zoned = parseLocalLoose(local);
	return `${pad(zoned.hour)}:${pad(zoned.minute)}`;
}
export function formatZoned(local: string): string {
	const zoned = parseLocalLoose(local);
	return new Intl.DateTimeFormat(LOCALE, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: zoned.timeZone,
		timeZoneName: "short",
	}).format(zoned.toDate());
}
/** Re-derive cached epoch + refreshed IXDTF from the stored wall-clock+zone under
 * CURRENT tzdata, discarding any stale embedded offset. The recompute core.
 * NOTE: `parseZonedDateTime` THROWS when the embedded offset disagrees with the
 * zone's current offset (verified against @internationalized/date 3.12) — i.e.
 * exactly the tzdata-change input this function exists for. `parseLocalLoose`
 * strips the offset before parsing so this re-derives the correct offset from
 * current rules (verified: stale +01:00 on a summer date -> corrected +02:00). */
export function recomputeZoned(local: string): ZonedValue {
	return zdtToValue(parseLocalLoose(local));
}

// --- Guest expiry (end-of-day-inclusive) ----------------------------------
export function composeExpiry(
	iso: string | null,
	timeZone: string
): ZonedValue | null {
	if (!iso) return null;
	const [year, month, day] = iso.split("-").map(Number);
	const start = toZoned(
		new CalendarDateTime(year, month, day, 0, 0, 1),
		timeZone,
		"compatible"
	);
	return zdtToValue(start.add({ days: 1 }));
}
/** Inverse: the chosen day shown in the field = the day BEFORE the instant's zone-day. */
export function expiryChosenIso(local: string): string {
	const zoned = parseLocalLoose(local).add({ days: -1 });
	return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}`;
}
export function minExpiryIso(timeZone: string): string {
	const zoned = zonedFromEpoch(Date.now(), timeZone);
	return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}`;
}
/** The chosen access-END day (YYYY-MM-DD) to DISPLAY for a guest, given the
 *  stored expiry. Three cases, because legacy/seed rows are not the new
 *  end-of-day-exclusive encoding:
 *  - `local` absent: the epoch's own zone day. No inverse — the encoding is
 *    unknown on a bare epoch. `accessUntilLocal` stays optional on the schema
 *    (an open-ended grant has no `accessUntil` at all), so this branch is a
 *    permanent guard, not a transitional one.
 *  - `local` present AND 00:00:01 wall-clock (Model-B end-of-day-exclusive): the
 *    day before (`expiryChosenIso`).
 *  - `local` present, any other wall-clock (a preserved arbitrary legacy/seed
 *    instant): its own day. */
export function guestChosenIso(
	local: string | undefined,
	epoch: number,
	tz: string
): string {
	if (local === undefined) return zonedDate(zonedLocalFromEpoch(epoch, tz));
	const zoned = parseLocalLoose(local);
	return zoned.hour === 0 && zoned.minute === 0 && zoned.second === 1
		? expiryChosenIso(local)
		: zonedDate(local);
}

/** The text of a trailing `[Zone]`: from the first `[` after the last earlier
 *  `]`, up to the final `]`. Undefined when the value does not end that way. */
function zoneSuffix(local: string): string | undefined {
	if (!local.endsWith("]")) return undefined;
	const body = local.slice(0, -1);
	const open = body.indexOf("[", body.lastIndexOf("]") + 1);
	return open === -1 || open + 1 === body.length
		? undefined
		: body.slice(open + 1);
}

/** The IANA zone from an IXDTF value's trailing `[Zone]`. Throws if absent. */
export function zonedTimeZoneName(local: string): string {
	const zone = zoneSuffix(local);
	if (zone === undefined)
		throw new Error(`Not an IXDTF zoned value: ${local}`);
	return zone;
}

// --- Date-only (unchanged behaviour; dedup) -------------------------------
export function isoToUtcMidnight(iso: string | null): number | undefined {
	if (!iso) return undefined;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? undefined : ms;
}
export function utcMidnightToIso(ms: number | undefined): string | undefined {
	return ms === undefined
		? undefined
		: new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);
}
const FMT_SHORT = new Intl.DateTimeFormat(LOCALE, {
	day: "2-digit",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});
const FMT_LONG = new Intl.DateTimeFormat(LOCALE, {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
export function formatDateOnly(ms: number | undefined): string {
	return ms === undefined ? "" : FMT_SHORT.format(new Date(ms));
}
export function formatDateOnlyLong(ms: number | undefined): string {
	return ms === undefined ? "" : FMT_LONG.format(new Date(ms));
}
