// @vitest-environment node
//
// convex-test proves LOGIC ONLY — it commits scheduled-function rows and
// mutation writes in-process, on a fixture, with whatever tzdata Node ships.
// It is NOT a substitute for the prod preview: the actual safety net for this
// migration is a human reading `previewTimezoneMigration`'s output against
// real rows before `runTimezoneMigration` ever writes. See TIMEZONE.md.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import { composeExpiry, composeZoned, utcFromLocal } from "./lib/time.ts";
import {
	isLegacyExpiry,
	isSuspiciousGuestExpiry,
	preserveAsZoned,
	remeanGuestExpiry,
} from "./migrateEventTimes.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const ZURICH = "Europe/Zurich";
const DAY_MS = 86_400_000;

// --- Pure transforms -------------------------------------------------------

describe("isLegacyExpiry", () => {
	it("true for an old '18th 00:00:01 Zurich' epoch", () => {
		// composeExpiry("2026-09-17", ...) lands on the 18th 00:00:01 Zurich
		// (its own +1-day-inclusive convention).
		const ms = composeExpiry("2026-09-17", ZURICH)!.utc;
		expect(isLegacyExpiry(ms, ZURICH)).toBe(true);
	});
	it("false for a now+90*DAY-style arbitrary instant (the seed.ts shape)", () => {
		// Fixed base, not Date.now(), so this can never flake onto 00:00:01.
		const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
		expect(isLegacyExpiry(BASE + 90 * DAY_MS, ZURICH)).toBe(false);
	});
});

describe("isSuspiciousGuestExpiry", () => {
	it("true for a foreign-browser 00:00:01 (London → 01:00:01 Zurich)", () => {
		// 00:00:01 UTC on 2027-01-16 is 01:00:01 Zurich (CET, +01) — the
		// fingerprint of an old London-browser `expiryFromIso`.
		const ms = Date.parse("2027-01-16T00:00:01Z");
		expect(isSuspiciousGuestExpiry(ms, ZURICH)).toBe(true);
	});
	it("false for a Zurich-native 00:00:01 (hour 0 — that shape is re-meaned)", () => {
		const ms = composeExpiry("2026-09-17", ZURICH)!.utc; // 18th 00:00:01 Zurich
		expect(isSuspiciousGuestExpiry(ms, ZURICH)).toBe(false);
	});
	it("false for a seed.ts arbitrary instant (non-:01 seconds)", () => {
		const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
		expect(isSuspiciousGuestExpiry(BASE + 90 * DAY_MS, ZURICH)).toBe(false);
	});
});

describe("remeanGuestExpiry", () => {
	it("re-means an 18th-00:00:01-Zurich expiry to the 19th, +~24h", () => {
		const legacy = composeExpiry("2026-09-17", ZURICH)!; // -> 18th 00:00:01 Zurich
		const next = remeanGuestExpiry(legacy.utc, ZURICH);
		expect(next.local.startsWith("2026-09-19T00:00:01")).toBe(true);
		// "+~24h": a DST-adjacent day could be 23 or 25h; this fixture (mid
		// September) crosses no transition, so it's exactly one day.
		expect(next.utc - legacy.utc).toBe(DAY_MS);
	});
});

describe("preserveAsZoned", () => {
	it("keeps the epoch byte-identical, including sub-second milliseconds", () => {
		// Seed-style arbitrary instants carry real millisecond components — if
		// the IXDTF round-trip ever dropped them, every preserved row would
		// falsely show up as "changed" the next time recomputeEpochs runs.
		const ms = Date.UTC(2026, 8, 20, 14, 37, 22, 123);
		const v = preserveAsZoned(ms, ZURICH);
		expect(v.utc).toBe(ms);
		expect(utcFromLocal(v.local)).toBe(ms);
	});
	it("yields a parseable IXDTF string", () => {
		const v = preserveAsZoned(Date.UTC(2026, 8, 20), ZURICH);
		expect(() => utcFromLocal(v.local)).not.toThrow();
	});
});

// --- Steps 2-5: convex-test (logic only, see file-top note) ----------------

async function makeCreator(t: ReturnType<typeof convexTest>) {
	return t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "board@example.com",
			firstName: "Board",
			lastName: "Member",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

describe("runTimezoneMigration", () => {
	it("re-means a 00:00:01-Zurich guest expiry +~24h", async () => {
		const t = convexTest(schema, modules);
		const accessUntil = composeExpiry("2026-09-17", ZURICH)!.utc; // 18th 00:00:01 Zurich
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "guest@example.com",
				firstName: "Guest",
				lastName: "One",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil,
			})
		);

		const result = await t.mutation(
			internal.migrateEventTimes.runTimezoneMigration,
			{}
		);
		expect(result.guests).toHaveLength(1);

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person!.accessUntilLocal).toBeDefined();
		expect(person!.accessUntil).toBe(accessUntil + DAY_MS);
		expect(
			person!.accessUntilLocal!.startsWith("2026-09-19T00:00:01")
		).toBe(true);
	});

	it("schedules a fresh windowExpired job at the new accessUntil for a re-meaned future guest", async () => {
		const t = convexTest(schema, modules);
		// A future legacy expiry so the re-meaned instant is still in the
		// future too (2100 keeps this far from any "now" flakiness).
		const accessUntil = composeExpiry("2100-09-17", ZURICH)!.utc; // -> 18th 00:00:01 Zurich
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "future-guest@example.com",
				firstName: "Future",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil,
			})
		);

		await t.mutation(internal.migrateEventTimes.runTimezoneMigration, {});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		const expectedNewAccessUntil = accessUntil + DAY_MS;
		expect(person!.accessUntil).toBe(expectedNewAccessUntil);

		// convex-test records scheduled functions at enqueue time in
		// _scheduled_functions rather than running them — assert the job's
		// name, args, AND scheduled time so this actually pins the new instant
		// rather than merely "some job got scheduled".
		const jobs = await t.run((ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(1);
		expect(jobs[0].name).toBe("lifecycle:windowExpired");
		expect(jobs[0].args).toEqual([{ personId: id }]);
		expect(jobs[0].scheduledTime).toBe(expectedNewAccessUntil);
	});

	it("preserves an arbitrary now+90*DAY-style guest expiry: accessUntilLocal set, accessUntil UNCHANGED", async () => {
		const t = convexTest(schema, modules);
		const BASE = Date.UTC(2026, 0, 1, 12, 0, 0);
		const accessUntil = BASE + 90 * DAY_MS;
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "seed-guest@example.com",
				firstName: "Seed",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil,
			})
		);

		await t.mutation(internal.migrateEventTimes.runTimezoneMigration, {});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person!.accessUntilLocal).toBeDefined();
		expect(person!.accessUntil).toBe(accessUntil);
	});
});

describe("previewTimezoneMigration / verifyTimezoneMigration", () => {
	it("flags a preserved foreign-browser guest expiry as suspicious, a seed one as not", async () => {
		const t = convexTest(schema, modules);
		// Foreign-browser legacy: 01:00:01 Zurich — preserved (not the native
		// 00:00:01 re-mean shape), and surfaced for human review.
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "london@example.com",
				firstName: "London",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.parse("2027-01-16T00:00:01Z"),
			})
		);
		// Seed shape: arbitrary instant, preserved, NOT suspicious.
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "seed@example.com",
				firstName: "Seed",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.UTC(2026, 0, 1, 12, 0, 0) + 90 * DAY_MS,
			})
		);

		const preview = await t.query(
			internal.migrateEventTimes.previewTimezoneMigration,
			{}
		);
		const london = preview.guests.find((g) => g.name.includes("London"))!;
		const seed = preview.guests.find((g) => g.name.includes("Seed"))!;
		expect(london.classification).toBe("preserve");
		expect(london.suspicious).toBe(true);
		expect(seed.classification).toBe("preserve");
		expect(seed.suspicious).toBe(false);
	});
});

describe("recomputeEpochs / previewRecompute", () => {
	it("fixes a stale-offset event field and leaves an already-correct field alone", async () => {
		const t = convexTest(schema, modules);
		const createdBy = await makeCreator(t);
		// A July date (CEST, +02:00) but with a STALE +01:00 offset baked into
		// the stored IXDTF — the exact shape recomputeZoned exists to fix (see
		// lib/time.ts's own verified comment on recomputeZoned).
		const staleLocal = "2026-07-15T03:00:00+01:00[Europe/Zurich]";
		const staleStoredEpoch = Date.UTC(2026, 6, 15, 2, 0); // matches the STALE +01:00 math
		const correctEnd = composeZoned("2026-07-15", "17:00", ZURICH);
		const id = await t.run(async (ctx) =>
			ctx.db.insert("events", {
				name: "Stale Offset Event",
				startsAt: staleStoredEpoch,
				startsAtLocal: staleLocal,
				endsAt: correctEnd.utc,
				endsAtLocal: correctEnd.local,
				createdBy,
				createdAt: Date.now(),
			})
		);

		const preview = await t.query(
			internal.migrateEventTimes.previewRecompute,
			{}
		);
		expect(preview.events).toHaveLength(1);
		expect(preview.events[0].field).toBe("startsAt");

		const result = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{}
		);
		expect(result.changed).toBe(1);

		const event = await t.run(async (ctx) => ctx.db.get(id));
		// Corrected to the CURRENT (+02:00) offset -> 01:00 UTC, not 02:00.
		expect(event!.startsAt).toBe(Date.UTC(2026, 6, 15, 1, 0));
		expect(event!.startsAtLocal).toContain("+02:00");
		// The already-correct endsAt field is untouched (true no-op).
		expect(event!.endsAt).toBe(correctEnd.utc);
		expect(event!.endsAtLocal).toBe(correctEnd.local);
	});

	it("is a true no-op on an already-correct row: 0 changed, done:true (after both phases)", async () => {
		const t = convexTest(schema, modules);
		const createdBy = await makeCreator(t);
		const starts = composeZoned("2026-09-20", "00:01", ZURICH);
		const ends = composeZoned("2026-09-20", "23:59", ZURICH);
		await t.run(async (ctx) =>
			ctx.db.insert("events", {
				name: "Correct Event",
				startsAt: starts.utc,
				startsAtLocal: starts.local,
				endsAt: ends.utc,
				endsAtLocal: ends.local,
				createdBy,
				createdAt: Date.now(),
			})
		);

		const preview = await t.query(
			internal.migrateEventTimes.previewRecompute,
			{}
		);
		expect(preview.events).toHaveLength(0);

		// Exactly one `.paginate()` call per invocation (see the comment on
		// `recomputeEpochs`), so finishing the events phase always hands off
		// to people on a SEPARATE call, even when nothing needs to change.
		const first = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{}
		);
		expect(first.changed).toBe(0);
		expect(first.done).toBe(false);

		const second = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{
				cursor: first.cursor,
			}
		);
		expect(second.changed).toBe(0);
		expect(second.done).toBe(true);
	});

	it("also recomputes a guest accessUntilLocal, paging from events into people across TWO calls", async () => {
		const t = convexTest(schema, modules);
		const createdBy = await makeCreator(t);
		const staleLocal = "2026-07-15T03:00:00+01:00[Europe/Zurich]";
		const staleStoredEpoch = Date.UTC(2026, 6, 15, 2, 0);
		await t.run(async (ctx) =>
			ctx.db.insert("events", {
				name: "Stale Event",
				startsAt: staleStoredEpoch,
				startsAtLocal: staleLocal,
				endsAt: staleStoredEpoch + DAY_MS,
				endsAtLocal: staleLocal,
				createdBy,
				createdAt: Date.now(),
			})
		);
		const guestStaleEpoch = Date.UTC(2026, 6, 20, 2, 0);
		const guestId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "stale-guest@example.com",
				firstName: "Stale",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: guestStaleEpoch,
				accessUntilLocal: "2026-07-20T03:00:00+01:00[Europe/Zurich]",
			})
		);

		// First call: events phase only (one `.paginate()` call) — the sole
		// event is stale, so it is fixed; `done` stays false because the
		// people phase has not run yet.
		const first = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{}
		);
		expect(first.done).toBe(false);
		expect(first.changed).toBe(1);
		expect(first.cursor).toBeDefined();

		// Second call, threading the returned cursor: people phase only.
		const second = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{
				cursor: first.cursor,
			}
		);
		expect(second.done).toBe(true);
		expect(second.changed).toBe(1);

		const guest = await t.run(async (ctx) => ctx.db.get(guestId));
		expect(guest!.accessUntilLocal).toContain("+02:00");
		expect(guest!.accessUntil).not.toBe(guestStaleEpoch);
	});

	it("limit:1 truncates mid-events-phase and returns a cursor to resume from", async () => {
		const t = convexTest(schema, modules);
		const createdBy = await makeCreator(t);
		const staleLocal = "2026-07-15T03:00:00+01:00[Europe/Zurich]";
		const staleStoredEpoch = Date.UTC(2026, 6, 15, 2, 0);
		for (let i = 0; i < 2; i++) {
			await t.run(async (ctx) =>
				ctx.db.insert("events", {
					name: `Stale ${String(i)}`,
					startsAt: staleStoredEpoch,
					startsAtLocal: staleLocal,
					endsAt: staleStoredEpoch + DAY_MS,
					endsAtLocal: staleLocal,
					createdBy,
					createdAt: Date.now(),
				})
			);
		}

		const first = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{ limit: 1 }
		);
		expect(first.done).toBe(false);
		expect(first.changed).toBe(1);
		expect(first.cursor).toBeDefined();

		const second = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{
				limit: 1,
				cursor: first.cursor,
			}
		);
		expect(second.changed).toBe(1);
	});

	it("reschedules a windowExpired job at the new instant when a guest epoch moves forward into the future", async () => {
		const t = convexTest(schema, modules);
		// A far-future stale-offset guest expiry so the recomputed epoch is
		// still in the future too (2100 keeps this far from any "now" flakiness).
		const staleLocal = "2100-07-15T03:00:00+01:00[Europe/Zurich]";
		const staleStoredEpoch = Date.UTC(2100, 6, 15, 2, 0); // matches the STALE +01:00 math
		const guestId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "future-stale-guest@example.com",
				firstName: "Future",
				lastName: "Stale",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: staleStoredEpoch,
				accessUntilLocal: staleLocal,
			})
		);

		// First call: events phase (empty table, still costs one call per the
		// two-phase contract). Second call: people phase, where the guest lives.
		const first = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{}
		);
		expect(first.done).toBe(false);
		const second = await t.mutation(
			internal.migrateEventTimes.recomputeEpochs,
			{ cursor: first.cursor }
		);
		expect(second.done).toBe(true);
		expect(second.changed).toBe(1);

		const guest = await t.run(async (ctx) => ctx.db.get(guestId));
		const newAccessUntil = guest!.accessUntil;
		expect(newAccessUntil).not.toBe(staleStoredEpoch);

		// convex-test records scheduled functions at enqueue time — assert the
		// job's name, args, AND scheduled time so this pins the NEW instant
		// (per apps/web/AGENTS.md: asserting only that a job exists doesn't prove it's
		// the right one).
		const jobs = await t.run((ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(1);
		expect(jobs[0].name).toBe("lifecycle:windowExpired");
		expect(jobs[0].args).toEqual([{ personId: guestId }]);
		expect(jobs[0].scheduledTime).toBe(newAccessUntil);
	});

	it("previewRecompute reports eventsTruncated/guestsTruncated: false when the raw take() is under the cap", async () => {
		const t = convexTest(schema, modules);
		const createdBy = await makeCreator(t);
		await t.run(async (ctx) =>
			ctx.db.insert("events", {
				name: "Untouched",
				startsAt: composeZoned("2026-09-20", "00:01", ZURICH).utc,
				startsAtLocal: composeZoned("2026-09-20", "00:01", ZURICH)
					.local,
				endsAt: composeZoned("2026-09-20", "23:59", ZURICH).utc,
				endsAtLocal: composeZoned("2026-09-20", "23:59", ZURICH).local,
				createdBy,
				createdAt: Date.now(),
			})
		);

		const preview = await t.query(
			internal.migrateEventTimes.previewRecompute,
			{}
		);
		expect(preview.eventsTruncated).toBe(false);
		expect(preview.guestsTruncated).toBe(false);
	});

	it("previewRecompute reports eventsTruncated: true when the raw events take() hits RECOMPUTE_PREVIEW_LIMIT, based on the RAW count not the filtered (changed-only) rows", async () => {
		// RECOMPUTE_PREVIEW_LIMIT is 1000. Every row here is already correct
		// (no field would change under recompute), so the FILTERED `events`
		// array in the response stays empty — this is exactly the fixture that
		// proves the flag reads the raw take() length, not `eventRows.length`
		// (a filtered-length implementation would report false here).
		const t = convexTest(schema, modules);
		const createdBy = await makeCreator(t);
		const starts = composeZoned("2026-09-20", "00:01", ZURICH);
		const ends = composeZoned("2026-09-20", "23:59", ZURICH);
		await t.run(async (ctx) => {
			for (let i = 0; i < 1000; i++) {
				await ctx.db.insert("events", {
					name: `Correct ${String(i)}`,
					startsAt: starts.utc,
					startsAtLocal: starts.local,
					endsAt: ends.utc,
					endsAtLocal: ends.local,
					createdBy,
					createdAt: Date.now(),
				});
			}
		});

		const preview = await t.query(
			internal.migrateEventTimes.previewRecompute,
			{}
		);
		expect(preview.events).toHaveLength(0);
		expect(preview.eventsTruncated).toBe(true);
		expect(preview.guestsTruncated).toBe(false);
	}, 20_000);
});
