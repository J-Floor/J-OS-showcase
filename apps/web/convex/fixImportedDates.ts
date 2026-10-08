// One-off: the Notion import dated every approval and signature 2025-12-31.
//
// 111 events (26 APPROVE_GUEST, 29 APPROVE_MEMBER, 56 SIGN_AGREEMENT) and the
// 56 signatures that go with them all carry that one day, which is not a date
// anybody was approved or signed on — it is what the importer produced when it
// could not read a real one. `0722828` fixed the same class of bug on access
// windows and signature dates; this is the part it missed.
//
//   bunx convex run fixImportedDates:preview --prod     # look first
//   bunx convex run fixImportedDates:run --prod
//
// The replacement is the only honest thing the data supports: a day after they
// applied. That is a stand-in, not a recovered fact — but "the day after they
// applied" is roughly true of this cohort and, unlike 2025-12-31, it does not
// put the signature before the application.
//
// Run this BEFORE `backfillStageSince`, which reads these timestamps.
//
// Idempotent: a row is only touched while it still falls on the bad day.
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

/** The day the importer stamped on everything it could not date, UTC. */
const BAD_FROM = Date.UTC(2025, 11, 31);
const BAD_UNTIL = Date.UTC(2026, 0, 1);

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** How many rows one transaction repairs. Both passes below filter on the bad
 *  window, so a repaired row leaves the working set and the next call picks up
 *  where this one stopped — `.take` converges without a cursor. */
const BATCH_SIZE = 200;

/** Only these carry the bad day, confirmed against production. Named rather
 *  than inferred from the date alone, so a future row that happens to fall on
 *  2025-12-31 for real reasons is not quietly rewritten. */
const REPAIRABLE_EVENTS = new Set([
	"APPROVE_GUEST",
	"APPROVE_MEMBER",
	"SIGN_AGREEMENT",
]);

/**
 * The board approved them a day after they applied.
 *
 * The signature lands a minute later rather than at the same instant: both
 * timestamps are stand-ins, and two identical ones would leave the drawer's
 * timeline free to print "Signed the agreement" above "Approved as a member".
 * A minute is not a claim about how long they took — it is the smallest thing
 * that keeps the order true.
 */
function approvedAt(submittedAt: number): number {
	return submittedAt + DAY_MS;
}
function signedAt(submittedAt: number): number {
	return approvedAt(submittedAt) + MINUTE_MS;
}

/** What this event's `at` should become, or null when we cannot say. */
function repairedEventAt(
	event: Doc<"personEvents">,
	person: Doc<"people"> | null
): number | null {
	const name = event.event;
	if (name === undefined || !REPAIRABLE_EVENTS.has(name)) return null;
	const submittedAt = person?.submittedAt;
	// No application date means no anchor. Leaving the bad date is better than
	// inventing a second one on top of it.
	if (submittedAt === undefined) return null;
	return name === "SIGN_AGREEMENT"
		? signedAt(submittedAt)
		: approvedAt(submittedAt);
}

/** Events still sitting on the bad day, oldest batch first. */
async function badEvents(
	ctx: QueryCtx,
	limit: number
): Promise<Doc<"personEvents">[]> {
	return ctx.db
		.query("personEvents")
		.filter((q) =>
			q.and(
				q.gte(q.field("at"), BAD_FROM),
				q.lt(q.field("at"), BAD_UNTIL)
			)
		)
		.take(limit);
}

/** Signatures still sitting on the bad day. */
async function badSignatures(
	ctx: QueryCtx,
	limit: number
): Promise<Doc<"signatures">[]> {
	return ctx.db
		.query("signatures")
		.filter((q) =>
			q.and(
				q.gte(q.field("signedAt"), BAD_FROM),
				q.lt(q.field("signedAt"), BAD_UNTIL)
			)
		)
		.take(limit);
}

/** Look before touching anything. Reports exactly what `run` would do. */
export const preview = internalQuery({
	args: {},
	handler: async (ctx) => {
		const events = await badEvents(ctx, BATCH_SIZE);
		const signatures = await badSignatures(ctx, BATCH_SIZE);

		const eventRows = await Promise.all(
			events.map(async (event) => {
				const person = await ctx.db.get(event.personId);
				const to = repairedEventAt(event, person);
				return {
					name: `${person?.firstName ?? "?"} ${person?.lastName ?? ""}`.trim(),
					event: event.event,
					from: new Date(event.at).toISOString(),
					to: to === null ? null : new Date(to).toISOString(),
				};
			})
		);
		const signatureRows = await Promise.all(
			signatures.map(async (signature) => {
				const person = await ctx.db.get(signature.personId);
				const submittedAt = person?.submittedAt;
				return {
					email: signature.email,
					from: new Date(signature.signedAt).toISOString(),
					to:
						submittedAt === undefined
							? null
							: new Date(signedAt(submittedAt)).toISOString(),
				};
			})
		);
		return {
			events: {
				total: eventRows.length,
				skipped: eventRows.filter((r) => r.to === null).length,
				rows: eventRows,
			},
			signatures: {
				total: signatureRows.length,
				skipped: signatureRows.filter((r) => r.to === null).length,
				rows: signatureRows,
			},
		};
	},
});

/** Moves both the events and the signatures off the bad day, together — the
 *  drawer's timeline and the agreement record describe the same act, and one
 *  repaired without the other is two dates for one signature. */
export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, { dryRun }) => {
		let events = 0;
		let signatures = 0;
		let skipped = 0;

		for (const event of await badEvents(ctx, BATCH_SIZE)) {
			const person = await ctx.db.get(event.personId);
			const at = repairedEventAt(event, person);
			if (at === null) {
				skipped++;
				continue;
			}
			if (dryRun !== true) await ctx.db.patch(event._id, { at });
			events++;
		}

		for (const signature of await badSignatures(ctx, BATCH_SIZE)) {
			const person = await ctx.db.get(signature.personId);
			const submittedAt = person?.submittedAt;
			if (submittedAt === undefined) {
				skipped++;
				continue;
			}
			if (dryRun !== true)
				await ctx.db.patch(signature._id, {
					signedAt: signedAt(submittedAt),
				});
			signatures++;
		}

		return { events, signatures, skipped, dryRun: dryRun === true };
	},
});
