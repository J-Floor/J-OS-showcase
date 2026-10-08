import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

/** How long a fault that has not changed stays quiet before it re-nags. */
export const RENAG_MS = 7 * 24 * 60 * 60 * 1000;

/** Lock reachability seen by the 10-minute poll. */
export const DOOR_ONLINE_ALERT_KEY = "door-online";

/** People whose lifecycle state disagrees with their data (nightly check). */
export const LIFECYCLE_ALERT_KEY = "lifecycle-invariants";

/**
 * Should this fault be reported, and why?
 *
 * `changed` — what is wrong is different from last time (including "it just
 * started"). Always reported, immediately.
 * `renag`   — the same fault, still unfixed, and the re-nag interval has
 * elapsed.
 * `resolved`— it was broken, now it is not. Reported once, so the board knows
 * to stop chasing.
 */
export type AlertDecision = "changed" | "renag" | "resolved" | "silent";

/**
 * Decide whether to alert, and record the decision in the same transaction.
 *
 * A MUTATION, not a helper the caller can forget: the check and the "we have
 * now told them" write have to be atomic, or two sweeps overlapping — or one
 * retried — send the same email twice.
 *
 * Deliberately NOT built out of cancelling scheduled jobs. Real Convex commits
 * `_scheduled_functions` when the transaction commits, so a mutation cannot see
 * or cancel a job it scheduled itself; a safeguard built that way passes every
 * `convex-test` assertion and sends the email anyway in production. This gates
 * the DISPATCH instead: the caller only sends when this says so.
 *
 * `fingerprint` is a canonical description of what is currently wrong, and the
 * empty string means "nothing is". Passing a non-canonical one (unsorted, say)
 * would make an unchanged fault look like a new one every night, which is the
 * failure this exists to prevent — canonicalise before calling.
 */
export const claim = internalMutation({
	args: {
		key: v.string(),
		fingerprint: v.string(),
		now: v.optional(v.number()),
	},
	handler: async (ctx, { key, fingerprint, now }): Promise<AlertDecision> => {
		const at = now ?? Date.now();
		const existing = await ctx.db
			.query("opsAlerts")
			.withIndex("by_key", (q) => q.eq("key", key))
			.unique();

		if (!existing) {
			// Nothing on record. A first healthy sweep must NOT send an
			// all-clear for a fault that never happened, so it records silence
			// rather than announcing it.
			await ctx.db.insert("opsAlerts", {
				key,
				fingerprint,
				lastSentAt: at,
			});
			return fingerprint === "" ? "silent" : "changed";
		}

		if (existing.fingerprint === fingerprint) {
			// Healthy and still healthy: nothing to say, and no clock to run.
			if (fingerprint === "") return "silent";
			if (at - existing.lastSentAt < RENAG_MS) return "silent";
			await ctx.db.patch(existing._id, { lastSentAt: at });
			return "renag";
		}

		await ctx.db.patch(existing._id, { fingerprint, lastSentAt: at });
		return fingerprint === "" ? "resolved" : "changed";
	},
});

/**
 * Undo a claim whose email never actually went out.
 *
 * Without this, a claim is a promise the caller may not be able to keep: the row
 * says "the board has been told" the moment the decision is made, so an outage
 * in the mail provider a second later would buy a week of silence on the
 * strength of a message nobody received. Resetting `lastSentAt` leaves the
 * fingerprint in place — the fault has not changed — and lets the next sweep
 * take the re-nag branch immediately.
 *
 * Deliberately NOT a rollback to the previous fingerprint: the fault on record
 * IS the current one, and pretending otherwise would make the next sweep report
 * a change that never happened.
 */
export const release = internalMutation({
	args: { key: v.string(), fingerprint: v.optional(v.string()) },
	handler: async (ctx, { key, fingerprint }): Promise<null> => {
		const existing = await ctx.db
			.query("opsAlerts")
			.withIndex("by_key", (q) => q.eq("key", key))
			.unique();
		// With a fingerprint this is compare-and-set: a newer claim for a
		// different fault must not be undone by an older send that failed.
		if (
			existing &&
			(fingerprint === undefined || existing.fingerprint === fingerprint)
		)
			await ctx.db.patch(existing._id, { lastSentAt: 0 });
		return null;
	},
});
