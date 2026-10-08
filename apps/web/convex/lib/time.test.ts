// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
	composeExpiry,
	composeZoned,
	expiryChosenIso,
	formatDateOnly,
	formatDateOnlyLong,
	formatZoned,
	guestChosenIso,
	isoToUtcMidnight,
	minExpiryIso,
	recomputeZoned,
	utcFromLocal,
	utcMidnightToIso,
	zonedDate,
	zonedLocalFromEpoch,
	zonedTime,
	zonedTimeZoneName,
} from "./time.ts";

const ZURICH = "Europe/Zurich";
const LA = "America/Los_Angeles";

describe("composeZoned + accessors", () => {
	it("interprets wall-clock in the given zone (winter CET +1)", () => {
		const v = composeZoned("2026-01-15", "03:00", ZURICH);
		expect(v.utc).toBe(Date.UTC(2026, 0, 15, 2, 0));
		expect(zonedDate(v.local)).toBe("2026-01-15");
		expect(zonedTime(v.local)).toBe("03:00");
	});
	it("summer offset (CEST +2) for the same wall-clock", () => {
		expect(composeZoned("2026-07-15", "03:00", ZURICH).utc).toBe(
			Date.UTC(2026, 6, 15, 1, 0)
		);
	});
	it("stable wall-clock across DST, distinct epochs", () => {
		const w = composeZoned("2026-01-15", "03:00", ZURICH);
		const s = composeZoned("2026-07-15", "03:00", ZURICH);
		expect(w.utc).not.toBe(s.utc);
		expect(zonedTime(w.local)).toBe("03:00");
		expect(zonedTime(s.local)).toBe("03:00");
	});
	it("multi-site: LA offset differs (PDT -7)", () => {
		const v = composeZoned("2026-07-15", "03:00", LA);
		expect(v.utc).toBe(Date.UTC(2026, 6, 15, 10, 0));
		expect(zonedDate(v.local)).toBe("2026-07-15");
	});
	it("spring-forward gap 02:30 resolves forward, no throw", () => {
		const v = composeZoned("2026-03-29", "02:30", ZURICH);
		expect(Number.isFinite(v.utc)).toBe(true);
		expect(zonedTime(v.local)).toBe("03:30");
	});
	it("utcFromLocal re-derives the cached epoch from an IXDTF string", () => {
		const v = composeZoned("2026-09-20", "23:59", ZURICH);
		expect(utcFromLocal(v.local)).toBe(v.utc);
	});
});

describe("zonedLocalFromEpoch", () => {
	it("round-trips through utcFromLocal and matches Zurich wall-clock (CEST +2)", () => {
		// 2026-07-15T10:00:00Z is 12:00 in Zurich under summer DST (+2).
		const ms = Date.UTC(2026, 6, 15, 10, 0);
		const local = zonedLocalFromEpoch(ms, ZURICH);
		expect(utcFromLocal(local)).toBe(ms);
		expect(zonedDate(local)).toBe("2026-07-15");
		expect(zonedTime(local)).toBe("12:00");
	});
});

describe("recomputeZoned", () => {
	it("is a no-op when rules are unchanged", () => {
		const v = composeZoned("2026-07-15", "03:00", ZURICH);
		const r = recomputeZoned(v.local);
		expect(r.utc).toBe(v.utc);
		expect(zonedTime(r.local)).toBe("03:00");
	});
	it("re-derives from wall-clock+zone even if the embedded offset is stale", () => {
		// Feed a summer date carrying a WINTER offset (+01:00) — wrong for CEST.
		// recompute must ignore the stale offset and produce the correct +02:00 / 01:00 UTC.
		const stale = "2026-07-15T03:00:00+01:00[Europe/Zurich]";
		const r = recomputeZoned(stale);
		expect(r.utc).toBe(Date.UTC(2026, 6, 15, 1, 0));
		expect(zonedTime(r.local)).toBe("03:00");
	});
});

describe("readers tolerate a stale embedded offset (tzdata rule change)", () => {
	// This is CEST (+02:00) for real; the stored value carries a stale winter
	// (+01:00) offset, the exact shape a tzdata rule change produces between it
	// happening and the manual `recomputeEpochs` run. Every reader must survive
	// it (not throw), reading the wall-clock as written and deriving the
	// CORRECT epoch from current rules — not the stale embedded one.
	const stale = "2026-07-15T03:00:00+01:00[Europe/Zurich]";

	it("zonedTime reads the wall-clock as stored, no throw", () => {
		expect(() => zonedTime(stale)).not.toThrow();
		expect(zonedTime(stale)).toBe("03:00");
	});
	it("utcFromLocal derives the correct CEST epoch (+02:00), not the stale +01:00 one", () => {
		expect(() => utcFromLocal(stale)).not.toThrow();
		expect(utcFromLocal(stale)).toBe(Date.UTC(2026, 6, 15, 1, 0));
	});
	it("formatZoned returns a string, no throw", () => {
		expect(() => formatZoned(stale)).not.toThrow();
		expect(typeof formatZoned(stale)).toBe("string");
	});
	it("zonedDate and expiryChosenIso survive too", () => {
		expect(() => zonedDate(stale)).not.toThrow();
		expect(zonedDate(stale)).toBe("2026-07-15");
		expect(() => expiryChosenIso(stale)).not.toThrow();
		expect(expiryChosenIso(stale)).toBe("2026-07-14");
	});
});

describe("date-only (behaviour must match old impls)", () => {
	it("isoToUtcMidnight parses date-only as UTC midnight; NaN guard", () => {
		expect(isoToUtcMidnight("2026-09-18")).toBe(Date.UTC(2026, 8, 18));
		expect(isoToUtcMidnight(null)).toBeUndefined();
		expect(isoToUtcMidnight("not-a-date")).toBeUndefined();
	});
	it("utcMidnightToIso inverse", () => {
		expect(utcMidnightToIso(Date.UTC(2026, 8, 18))).toBe("2026-09-18");
		expect(utcMidnightToIso(undefined)).toBeUndefined();
	});
	it("formatDateOnly short; formatDateOnlyLong long", () => {
		expect(formatDateOnly(Date.UTC(2026, 5, 8))).toBe("08 Jun 2026");
		expect(formatDateOnlyLong(Date.UTC(2026, 5, 8))).toBe("8 June 2026");
		expect(formatDateOnly(undefined)).toBe("");
	});
});

describe("guest expiry (end-of-day-inclusive, zoned)", () => {
	it("'until Tuesday' -> 00:00:01 zone-time of Wednesday", () => {
		const v = composeExpiry("2026-09-15", ZURICH)!; // Tue; CEST +2
		expect(v.utc).toBe(Date.UTC(2026, 8, 15, 22, 0, 1));
		expect(composeExpiry(null, ZURICH)).toBeNull();
	});
	it("expiryChosenIso recovers the chosen day", () => {
		const v = composeExpiry("2026-09-15", ZURICH)!;
		expect(expiryChosenIso(v.local)).toBe("2026-09-15");
	});
	it("round-trips across the fall-back boundary (2026-10-25 is fall-back Sunday)", () => {
		const v = composeExpiry("2026-10-25", ZURICH)!;
		expect(expiryChosenIso(v.local)).toBe("2026-10-25");
	});
	it("minExpiryIso is today in the site zone (fixed clock near UTC midnight)", () => {
		// 2026-07-15T23:30:00Z is already 2026-07-16 in Zurich (CEST +2). A naive
		// UTC-date impl would return the 15th; the zoned impl must return the 16th.
		vi.setSystemTime(new Date("2026-07-15T23:30:00Z"));
		expect(minExpiryIso(ZURICH)).toBe("2026-07-16");
		vi.useRealTimers();
	});
});

describe("guestChosenIso (presence + encoding aware)", () => {
	it("local absent: falls back to the epoch's own zone day (no inverse)", () => {
		// 2026-07-15T23:30:00Z is already 2026-07-16 in Zurich (CEST +2).
		const ms = Date.parse("2026-07-15T23:30:00Z");
		expect(guestChosenIso(undefined, ms, ZURICH)).toBe("2026-07-16");
	});
	it("local present, 00:00:01 wall-clock (Model-B end-of-day-exclusive): the day before", () => {
		const v = composeExpiry("2026-09-15", ZURICH)!; // -> 16th 00:00:01 Zurich
		expect(guestChosenIso(v.local, v.utc, ZURICH)).toBe("2026-09-15");
	});
	it("local present, arbitrary wall-clock (preserved legacy/seed instant): its own day", () => {
		// A seed-style arbitrary instant, NOT 00:00:01 — its own day, not a day
		// early (the bug this function exists to fix).
		const local = "2026-09-15T14:37:22+02:00[Europe/Zurich]";
		const ms = utcFromLocal(local);
		expect(guestChosenIso(local, ms, ZURICH)).toBe("2026-09-15");
	});
});

describe("zonedTimeZoneName", () => {
	it("extracts the IANA zone from a trailing [Zone]", () => {
		expect(
			zonedTimeZoneName("2026-09-20T00:01:00+02:00[Europe/Zurich]")
		).toBe("Europe/Zurich");
		expect(
			zonedTimeZoneName("2026-09-20T00:01:00-07:00[America/Los_Angeles]")
		).toBe("America/Los_Angeles");
	});
	it("throws on a non-IXDTF value with no bracketed zone", () => {
		expect(() => zonedTimeZoneName("2026-09-20T00:01:00+02:00")).toThrow(
			/Not an IXDTF zoned value/
		);
	});
});
