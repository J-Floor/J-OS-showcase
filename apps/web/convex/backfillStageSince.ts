// One-off: every person's `stageSince` is the moment the cutover ran.
//
// `lifecycleMigration` wrote `stageSince: person.stageSince ?? now`, and the
// field did not exist before that migration, so the `??` fell through for every
// row. Production carried 250 of 251 people on a single instant — 2026-08-02
// 14:14:54Z — which the drawer honestly reported as "Since: Today" for all of
// them, and which would have marched to "Yesterday", "2 days ago" in lockstep
// forever.
//
//   bunx convex run backfillStageSince:preview --prod     # look first
//   bunx convex run backfillStageSince:run --prod
//
// The real dates survived: the same migration wrote `personEvents` with correct
// `at` values, only their `_creationTime` is the cutover instant. So the date a
// person entered the state they are in is recoverable from their own history.
//
// Run this AFTER `fixImportedDates`, which repairs the timestamps this reads.
//
// Idempotent: a person is only touched while their `stageSince` is still the
// cutover stamp.
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { stateOf } from "./lib/lifecycle.ts";

/**
 * The instant `lifecycleMigration` stamped on everybody. Hard-coded rather than
 * detected: "the value the most rows share" would, on a healthy table, be a
 * legitimate date shared by a cohort, and this must never fire on one of those.
 */
const CUTOVER_STAMP = 1_785_680_094_061;

/** Rows per transaction. Only rows still carrying the stamp are read, and every
 *  one of them is written to something else, so the working set shrinks and
 *  `.take` converges without a cursor. */
const BATCH_SIZE = 100;

type Recovered = { at: number; source: string };

/**
 * When this person entered the state they are in now.
 *
 * Best answer first:
 *
 * 1. The event that put them there. Exact, and available for just over half of
 *    them.
 * 2. Their most recent event. Needed because some states are entered without an
 *    event of their own — `prospect.queued` above all: you join the queue by
 *    verifying your email, and `VERIFY_EMAIL` is the event that records it.
 * 3. `verifiedAt` / `submittedAt`, for a row whose history is empty.
 * 4. `_creationTime`, which for these rows IS the cutover instant. Those rows
 *    are left alone and counted: the cutover time is genuinely the only date
 *    we hold for them, and rewriting it to itself would say we had learned
 *    something we had not.
 */
async function recover(
	ctx: QueryCtx,
	person: Doc<"people">
): Promise<Recovered> {
	const events = await ctx.db
		.query("personEvents")
		.withIndex("by_person", (q) => q.eq("personId", person._id))
		.collect();

	const state = stateOf(person);
	const entering = events.filter((e) => e.to === state).map((e) => e.at);
	if (entering.length > 0)
		return { at: Math.max(...entering), source: "entered-state event" };

	if (events.length > 0)
		return {
			at: Math.max(...events.map((e) => e.at)),
			source: "latest event",
		};

	if (person.verifiedAt !== undefined)
		return { at: person.verifiedAt, source: "verifiedAt" };
	if (person.submittedAt !== undefined)
		return { at: person.submittedAt, source: "submittedAt" };

	return { at: Math.floor(person._creationTime), source: "row created" };
}

/**
 * Never later than the stamp we are replacing.
 *
 * The stamp is when the cutover ran, so nothing that happened before it can be
 * newer. A future `at` would mean corrupt history, and "since a date in the
 * future" reads as a negative age — `daysInStage` floors it to 0, which is the
 * very "Today" this migration exists to remove.
 */
function capped(at: number): number {
	return Math.min(at, CUTOVER_STAMP);
}

/** People still carrying the cutover stamp. */
async function stamped(ctx: QueryCtx, limit: number): Promise<Doc<"people">[]> {
	return ctx.db
		.query("people")
		.filter((q) => q.eq(q.field("stageSince"), CUTOVER_STAMP))
		.take(limit);
}

/** Look before touching anything. Reports exactly what `run` would do. */
export const preview = internalQuery({
	args: {},
	handler: async (ctx) => {
		const people = await stamped(ctx, BATCH_SIZE);
		const rows = await Promise.all(
			people.map(async (person) => {
				const { at, source } = await recover(ctx, person);
				return {
					name: `${person.firstName} ${person.lastName}`.trim(),
					state: stateOf(person),
					source,
					since: new Date(capped(at)).toISOString().slice(0, 10),
					// Recovered the stamp itself: nothing to learn, left alone.
					skip: capped(at) === person.stageSince,
				};
			})
		);
		const bySource: Record<string, number> = {};
		for (const row of rows)
			bySource[row.source] = (bySource[row.source] ?? 0) + 1;
		return {
			total: rows.length,
			toWrite: rows.filter((r) => !r.skip).length,
			bySource,
			// A spread of days is the whole point; one date would mean this
			// changed nothing.
			distinctDays: new Set(rows.map((r) => r.since)).size,
			rows,
		};
	},
});

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, { dryRun }) => {
		const people = await stamped(ctx, BATCH_SIZE);
		let written = 0;
		let unknown = 0;
		for (const person of people) {
			const { at } = await recover(ctx, person);
			const next = capped(at);
			// Recovered the stamp itself: this row has no history to recover
			// FROM, so there is nothing to write. Skipped rather than rewritten
			// to the same number — which would also leave it matching the
			// filter below, and the batch re-reading it forever.
			if (next === person.stageSince) {
				unknown++;
				continue;
			}
			if (dryRun !== true)
				await ctx.db.patch(person._id, { stageSince: next });
			written++;
		}
		// Run again while `written` is above zero: one call repairs at most
		// BATCH_SIZE rows, and the last call returns only the `unknown` ones.
		return { written, unknown, dryRun: dryRun === true };
	},
});
