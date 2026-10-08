// PROD-GATED: guest-expiry backfill + tzdata recompute for the Model B
// zoned-time source of truth (`lib/time.ts`).
//
// The one-time EVENT backfill has been RETIRED: `events.startsAtLocal`/
// `endsAtLocal` are now required on the schema and every row was backfilled +
// verified on prod (see `TIMEZONE.md`), so no event row can lack `*Local`.
// What remains here:
//   - GUEST backfill: build `accessUntilLocal` for any `people` row that has an
//     `accessUntil` but no `*Local` yet. `accessUntilLocal` stays optional
//     forever (an open-ended grant has no `accessUntil`), so this stays live.
//   - RECOMPUTE: re-derive cached epochs from the stored `*Local` after an IANA
//     tzdata / DST-rule change (events + guests).
// This module does NOT run itself — a human runs each step via the CLI per
// `apps/web/convex/TIMEZONE.md`. Nothing here is wired into a cron or an app
// code path.
//
// Guest `accessUntil` has two real shapes in prod data: a UI-created row is
// exactly `00:00:01` Zurich wall-clock (`expiryFromIso`'s +1-day re-mean
// convention); `seed.ts`/`dev.ts` instead write arbitrary now-relative
// instants (`now + N*DAY`). Only the first shape is re-meaned; the second is
// preserved exactly and only gets its `*Local` attached.
//
// Idempotency key is `*Local` ABSENCE, never value-shape: a re-meaned expiry
// is itself `00:00:01` Zurich, so gating a re-run on shape would re-fire on
// rows already touched. `isLegacyExpiry` only chooses WHICH transform a row
// gets, never whether it runs again.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { displayName } from "./lib/names.ts";
import {
	composeExpiry,
	formatZoned,
	pad,
	recomputeZoned,
	SITE_TIMEZONE,
	type ZonedValue,
	zonedFromEpoch,
	zonedLocalFromEpoch,
} from "./lib/time.ts";

/** Rows processed per bounded call, when the caller does not override. */
const DEFAULT_LIMIT = 100;
/** Read-only preview/verify caps — generous since these never write. */
const PREVIEW_LIMIT = 500;
const RECOMPUTE_PREVIEW_LIMIT = 1000;

// --- Pure transforms -------------------------------------------------------

/** A UI-created guest expiry: exactly 00:00:01 wall-clock in the site zone. */
export function isLegacyExpiry(ms: number, tz: string): boolean {
	const z = zonedFromEpoch(ms, tz);
	return z.hour === 0 && z.minute === 0 && z.second === 1;
}

/** A preserved guest expiry whose wall-clock still looks like a FOREIGN-browser
 *  `expiryFromIso` from the pre-fix bug window: 00:00:01 in another zone lands
 *  on `HH:00:01` or `HH:30:01` Zurich (whole- and half-hour offsets), i.e.
 *  `second === 1`, `minute` a multiple of 30, `hour !== 0`. A Zurich-native
 *  expiry is `00:00:01` (excluded by `hour !== 0` — that shape is re-meaned, not
 *  preserved); a `seed.ts` `now + N*DAY` instant essentially never hits `:01`
 *  seconds on a `:00`/`:30` minute. Preview-only human-review flag: it NEVER
 *  changes the write (re-meaning a preserved row would EXTEND door access, which
 *  is why these are surfaced for a human to re-set via the picker, not
 *  auto-corrected). */
export function isSuspiciousGuestExpiry(ms: number, tz: string): boolean {
	const z = zonedFromEpoch(ms, tz);
	return z.second === 1 && z.minute % 30 === 0 && z.hour !== 0;
}

/** Attach a zone IXDTF to an existing instant WITHOUT changing it. */
export function preserveAsZoned(ms: number, tz: string): ZonedValue {
	return { local: zonedLocalFromEpoch(ms, tz), utc: ms };
}

/** Legacy guest expiry -> re-meaned end-of-chosen-day (+~24h). The chosen day
 *  is the instant's OWN zone day (a 00:00:01 Zurich epoch's day, not the day
 *  before), matching `expiryFromIso`'s convention. */
export function remeanGuestExpiry(ms: number, tz: string): ZonedValue {
	const z = zonedFromEpoch(ms, tz);
	// composeExpiry never returns null for a non-null iso.
	return composeExpiry(
		`${String(z.year)}-${pad(z.month)}-${pad(z.day)}`,
		tz
	)!;
}

function hhmmss(ms: number, tz: string): string {
	const z = zonedFromEpoch(ms, tz);
	return `${pad(z.hour)}:${pad(z.minute)}:${pad(z.second)}`;
}

// --- Candidate selection (shrinks as `*Local` gets populated) -------------

async function guestsNeedingWork(
	ctx: QueryCtx,
	limit: number
): Promise<Doc<"people">[]> {
	return ctx.db
		.query("people")
		.filter((q) =>
			q.and(
				q.neq(q.field("accessUntil"), undefined),
				q.eq(q.field("accessUntilLocal"), undefined)
			)
		)
		.take(limit);
}

// --- Guest backfill: read-only preview ------------------------------------

export const previewTimezoneMigration = internalQuery({
	args: {},
	handler: async (ctx) => {
		const guests = await guestsNeedingWork(ctx, PREVIEW_LIMIT);
		const guestRows = guests.map((person) => {
			// guaranteed by guestsNeedingWork's filter
			const ms = person.accessUntil!;
			const legacy = isLegacyExpiry(ms, SITE_TIMEZONE);
			const proposed = legacy
				? remeanGuestExpiry(ms, SITE_TIMEZONE)
				: preserveAsZoned(ms, SITE_TIMEZONE);
			return {
				id: person._id,
				name: displayName(person),
				accessUntil: {
					raw: ms,
					utc: new Date(ms).toISOString(),
					zurich: formatZoned(
						preserveAsZoned(ms, SITE_TIMEZONE).local
					),
					zonedTime: hhmmss(ms, SITE_TIMEZONE),
				},
				classification: legacy ? "legacyExpiry" : "preserve",
				// A preserved row whose wall-clock fingerprints a foreign-browser
				// legacy expiry — surfaced for a human to re-set via the picker
				// if the intended day is known. Never re-meaned automatically
				// (that would extend door access).
				suspicious:
					!legacy && isSuspiciousGuestExpiry(ms, SITE_TIMEZONE),
				proposed: {
					accessUntilLocal: proposed.local,
					accessUntil: proposed.utc,
				},
				deltaMs: proposed.utc - ms,
			};
		});

		return {
			guests: guestRows,
			guestsTruncated: guestRows.length === PREVIEW_LIMIT,
		};
	},
});

// --- Guest backfill: bounded write mutation -------------------------------

export const runTimezoneMigration = internalMutation({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, { limit }) => {
		const cap = limit ?? DEFAULT_LIMIT;

		const guests = await guestsNeedingWork(ctx, cap);
		const guestResults = [];
		for (const person of guests) {
			const ms = person.accessUntil!; // guaranteed by the filter
			const legacy = isLegacyExpiry(ms, SITE_TIMEZONE);
			const next = legacy
				? remeanGuestExpiry(ms, SITE_TIMEZONE)
				: preserveAsZoned(ms, SITE_TIMEZONE);
			if (legacy) {
				await ctx.db.patch(person._id, {
					accessUntil: next.utc,
					accessUntilLocal: next.local,
				});
				// The old windowExpired job (if any) was scheduled at the OLD
				// instant — re-meaning the expiry orphans it (it fires as a
				// no-op against the now-later accessUntil). Schedule a fresh
				// precise expiry at the new instant so door revocation stays
				// exact instead of falling back to the nightly sweep cron. Only
				// for re-meaned (legacyExpiry) guests — a `preserve` guest keeps
				// its instant and its existing job unchanged.
				if (next.utc > Date.now()) {
					await ctx.scheduler.runAt(
						next.utc,
						internal.lifecycle.windowExpired,
						{ personId: person._id }
					);
				}
			} else {
				await ctx.db.patch(person._id, {
					accessUntilLocal: next.local,
				});
			}
			guestResults.push({
				id: person._id,
				name: displayName(person),
				from: {
					accessUntil: ms,
					accessUntilLocal: person.accessUntilLocal,
				},
				to: { accessUntil: next.utc, accessUntilLocal: next.local },
			});
		}

		// Own writes are visible within the same transaction, so this peek
		// reflects post-patch state: `done` is exact, not a heuristic.
		const guestsLeft = await guestsNeedingWork(ctx, 1);
		return {
			done: guestsLeft.length === 0,
			guests: guestResults,
		};
	},
});

// --- Guest backfill: verify -----------------------------------------------

export const verifyTimezoneMigration = internalQuery({
	args: {},
	handler: async (ctx) => {
		const guests = await guestsNeedingWork(ctx, PREVIEW_LIMIT);
		return {
			guests: guests.map((p) => ({ id: p._id, name: displayName(p) })),
		};
	},
});

// --- Recompute (only after a tzdata/DST-rule change) ----------------------
//
// The candidate set here ("has a `*Local`") does NOT shrink as rows are
// patched — recomputing an already-correct row is a no-op that leaves it a
// candidate forever. A `.take(limit)` re-scan would therefore return the same
// prefix every call and never reach the rest of the table (see apps/web/AGENTS.md:
// "`.take()` only converges if the work shrinks the table ... paginate with a
// cursor when you are patching"). So this uses real cursor pagination across
// two phases (events, then people), encoded as one opaque string the caller
// passes back unchanged. `done: true` means both phases finished this call.

type RecomputePhase = "events" | "people";

function encodeCursor(phase: RecomputePhase, cursor: string | null): string {
	return `${phase}:${cursor ?? ""}`;
}
function decodeCursor(raw: string | undefined): {
	phase: RecomputePhase;
	cursor: string | null;
} {
	if (raw === undefined) return { phase: "events", cursor: null };
	const sep = raw.indexOf(":");
	const phase = raw.slice(0, sep) as RecomputePhase;
	const rest = raw.slice(sep + 1);
	return { phase, cursor: rest === "" ? null : rest };
}

async function recomputeEventEpoch(
	ctx: MutationCtx,
	event: Doc<"events">
): Promise<boolean> {
	const patch: {
		startsAt?: number;
		startsAtLocal?: string;
		endsAt?: number;
		endsAtLocal?: string;
	} = {};
	const nextStart = recomputeZoned(event.startsAtLocal);
	if (nextStart.utc !== event.startsAt) {
		patch.startsAt = nextStart.utc;
		patch.startsAtLocal = nextStart.local;
	}
	const nextEnd = recomputeZoned(event.endsAtLocal);
	if (nextEnd.utc !== event.endsAt) {
		patch.endsAt = nextEnd.utc;
		patch.endsAtLocal = nextEnd.local;
	}
	const changed = Object.keys(patch).length > 0;
	if (changed) await ctx.db.patch(event._id, patch);
	return changed;
}

async function recomputeGuestEpoch(
	ctx: MutationCtx,
	person: Doc<"people">
): Promise<boolean> {
	if (person.accessUntilLocal === undefined) return false;
	const next = recomputeZoned(person.accessUntilLocal);
	if (next.utc === person.accessUntil) return false;
	await ctx.db.patch(person._id, {
		accessUntil: next.utc,
		accessUntilLocal: next.local,
	});
	// A tzdata recompute that shifts the cached epoch orphans the old
	// windowExpired job (scheduled at the previous instant); a later new instant
	// would then no-op and door revocation would slip to the nightly sweep.
	// Re-arm a precise expiry at the new instant, as the backfill does.
	if (next.utc > Date.now()) {
		await ctx.scheduler.runAt(next.utc, internal.lifecycle.windowExpired, {
			personId: person._id,
		});
	}
	return true;
}

export const recomputeEpochs = internalMutation({
	args: { limit: v.optional(v.number()), cursor: v.optional(v.string()) },
	handler: async (ctx, { limit, cursor }) => {
		const cap = limit ?? DEFAULT_LIMIT;
		const start = decodeCursor(cursor);

		// Exactly ONE `.paginate()` call per invocation — even though it costs
		// an extra rerun at the events/people boundary, it keeps this call
		// unambiguously within whatever Convex's pagination contract is,
		// rather than relying on an unverified assumption that a second
		// `.paginate()` (on a different table, after the first is fully
		// consumed) is safe within one function call. convex-test does not
		// surface a violation here even if prod would; this is the same
		// "passes every test, fails prod" shape apps/web/AGENTS.md warns about
		// elsewhere, so it is not worth risking on a proc that runs rarely and
		// unsupervised against prod data.
		if (start.phase === "events") {
			const page = await ctx.db
				.query("events")
				.paginate({ cursor: start.cursor, numItems: cap });
			let changed = 0;
			for (const event of page.page) {
				if (await recomputeEventEpoch(ctx, event)) changed++;
			}
			if (!page.isDone) {
				return {
					done: false,
					changed,
					cursor: encodeCursor("events", page.continueCursor),
				};
			}
			// Events phase finished; hand off to people on the NEXT call.
			return {
				done: false,
				changed,
				cursor: encodeCursor("people", null),
			};
		}

		const peoplePage = await ctx.db
			.query("people")
			.paginate({ cursor: start.cursor, numItems: cap });
		let changed = 0;
		for (const person of peoplePage.page) {
			if (await recomputeGuestEpoch(ctx, person)) changed++;
		}

		return {
			done: peoplePage.isDone,
			changed,
			cursor: peoplePage.isDone
				? undefined
				: encodeCursor("people", peoplePage.continueCursor),
		};
	},
});

/** Read-only: rows whose recomputed epoch would differ from the stored one —
 *  run before `recomputeEpochs` to see the blast radius. Bounded read, not
 *  paginated (nothing here writes, so there is no convergence requirement). */
export const previewRecompute = internalQuery({
	args: {},
	handler: async (ctx) => {
		const events = await ctx.db
			.query("events")
			.take(RECOMPUTE_PREVIEW_LIMIT);
		const eventRows: {
			id: Id<"events">;
			name: string;
			field: "startsAt" | "endsAt";
			from: number;
			to: number;
			local: string;
		}[] = [];
		for (const event of events) {
			const nextStart = recomputeZoned(event.startsAtLocal);
			if (nextStart.utc !== event.startsAt) {
				eventRows.push({
					id: event._id,
					name: event.name,
					field: "startsAt",
					from: event.startsAt,
					to: nextStart.utc,
					local: nextStart.local,
				});
			}
			const nextEnd = recomputeZoned(event.endsAtLocal);
			if (nextEnd.utc !== event.endsAt) {
				eventRows.push({
					id: event._id,
					name: event.name,
					field: "endsAt",
					from: event.endsAt,
					to: nextEnd.utc,
					local: nextEnd.local,
				});
			}
		}

		const people = await ctx.db
			.query("people")
			.take(RECOMPUTE_PREVIEW_LIMIT);
		const guestRows: {
			id: Id<"people">;
			name: string;
			from: number | undefined;
			to: number;
			local: string;
		}[] = [];
		for (const person of people) {
			if (person.accessUntilLocal === undefined) continue;
			const next = recomputeZoned(person.accessUntilLocal);
			if (next.utc === person.accessUntil) continue;
			guestRows.push({
				id: person._id,
				name: displayName(person),
				from: person.accessUntil,
				to: next.utc,
				local: next.local,
			});
		}

		return {
			events: eventRows,
			guests: guestRows,
			// Based on the RAW `.take()` length, not the filtered (changed-only)
			// row arrays above — a table at the cap is truncated even when every
			// row on the page happens to already be correct.
			eventsTruncated: events.length === RECOMPUTE_PREVIEW_LIMIT,
			guestsTruncated: people.length === RECOMPUTE_PREVIEW_LIMIT,
		};
	},
});
