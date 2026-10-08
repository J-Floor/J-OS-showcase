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

/** A zoned value: IXDTF source of truth + cached UTC epoch (ms). */
export type ZonedValue = {
	local: string;
	utc: number;
};

export function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** The zoned wall-clock a UTC epoch (ms) lands on, observed at `timeZone`. */
export function zonedFromEpoch(ms: number, timeZone: string): ZonedDateTime {
	return parseAbsolute(new Date(ms).toISOString(), timeZone);
}
function zdtToValue(z: ZonedDateTime): ZonedValue {
	return { local: z.toString(), utc: z.toDate().getTime() };
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
	const [y, m, d] = dateIso.split("-").map(Number);
	const [h, min] = timeHHMM.split(":").map(Number);
	return zdtToValue(
		toZoned(new CalendarDateTime(y, m, d, h, min), timeZone, "compatible")
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
	const z = parseLocalLoose(local);
	return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}
export function zonedTime(local: string): string {
	const z = parseLocalLoose(local);
	return `${pad(z.hour)}:${pad(z.minute)}`;
}
export function formatZoned(local: string): string {
	const z = parseLocalLoose(local);
	return new Intl.DateTimeFormat(LOCALE, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: z.timeZone,
		timeZoneName: "short",
	}).format(z.toDate());
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
	const [y, m, d] = iso.split("-").map(Number);
	const start = toZoned(
		new CalendarDateTime(y, m, d, 0, 0, 1),
		timeZone,
		"compatible"
	);
	return zdtToValue(start.add({ days: 1 }));
}
/** Inverse: the chosen day shown in the field = the day BEFORE the instant's zone-day. */
export function expiryChosenIso(local: string): string {
	const z = parseLocalLoose(local).add({ days: -1 });
	return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}
export function minExpiryIso(timeZone: string): string {
	const z = zonedFromEpoch(Date.now(), timeZone);
	return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
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
	const z = parseLocalLoose(local);
	if (z.hour === 0 && z.minute === 0 && z.second === 1)
		return expiryChosenIso(local);
	return zonedDate(local);
}

const ZONE_SUFFIX = /\[([^\]]+)\]$/;

/** The IANA zone from an IXDTF value's trailing `[Zone]`. Throws if absent. */
export function zonedTimeZoneName(local: string): string {
	const m = ZONE_SUFFIX.exec(local);
	if (!m) throw new Error(`Not an IXDTF zoned value: ${local}`);
	return m[1];
}

// --- Date-only (unchanged behaviour; dedup) -------------------------------
export function isoToUtcMidnight(iso: string | null): number | undefined {
	if (!iso) return undefined;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? undefined : ms;
}
export function utcMidnightToIso(ms: number | undefined): string | undefined {
	return ms == null ? undefined : new Date(ms).toISOString().slice(0, 10);
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
	return ms == null ? "" : FMT_SHORT.format(new Date(ms));
}
export function formatDateOnlyLong(ms: number | undefined): string {
	return ms == null ? "" : FMT_LONG.format(new Date(ms));
}
