import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { abandoned, purgeConfirmTokens } from "./lib/confirmToken.ts";
import { peopleByEmail } from "./lib/emailAddress.ts";

// Convex mutations are transactions with limits on documents read and
// written; the application and visitor sign-up forms are both public and
// unauthenticated, so `people` at tier `prospect` or `visitor` is exactly the
// table a bot can flood without limit. A cap here keeps a single run well
// inside those limits even under a spam spike,
// at the cost of spreading a large backlog over more than one night — a
// purge that clears 200 rows a night still drains the backlog, whereas one
// that reads the whole table and aborts clears nothing. The nightly cadence
// (Task 22) is what makes that an acceptable trade rather than a lost purge.
export const BATCH_SIZE = 200;

/**
 * Delete sign-ups that were never confirmed. The magic link is already dead at
 * token expiry (VERIFY_TTL_MS, 7 days), so nothing is lost: a returning person
 * simply submits again and gets a fresh one.
 *
 * These rows hold a real name, email and phone belonging to someone who never
 * confirmed they wanted anything from J Floor, and they include bot submissions
 * and typo'd addresses that could never be confirmed. Deleting is the point.
 *
 * Logged, not silent — a spike in `purgeLog` is how a broken verification email
 * surfaces, because otherwise that failure looks identical to nobody applying.
 */
export const purgeUnverified = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const prospects = await ctx.db
			.query("people")
			.withIndex("by_tier", (q) => q.eq("tier", "prospect"))
			.take(BATCH_SIZE);
		let count = 0;
		for (const person of prospects) {
			if (!(await abandoned(ctx.db, person, now))) continue;
			const events = await ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", person._id))
				.collect();
			for (const event of events) await ctx.db.delete(event._id);
			await ctx.db.delete(person._id);
			count++;
		}
		const visitors = await ctx.db
			.query("people")
			.withIndex("by_tier", (q) => q.eq("tier", "visitor"))
			.take(BATCH_SIZE);
		for (const person of visitors) {
			if (!(await abandoned(ctx.db, person, now))) continue;
			const events = await ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", person._id))
				.collect();
			for (const event of events) await ctx.db.delete(event._id);
			await ctx.db.delete(person._id);
			count++;
		}
		const tokens = await purgeConfirmTokens(ctx, now, BATCH_SIZE);
		await ctx.db.insert("purgeLog", { at: now, count });
		return { count, tokens };
	},
});

// Targeted cleanup: delete every person row for one email, with their
// signatures, audit events and confirm tokens (a staged re-application
// payload holds personal data). Used to remove a test or duplicate account.
export const purgeEmail = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		let deleted = 0;
		const people = await peopleByEmail(ctx, email).collect();
		for (const p of people) {
			for (const s of await ctx.db
				.query("signatures")
				.withIndex("by_person", (q) => q.eq("personId", p._id))
				.collect()) {
				await ctx.db.delete(s._id);
				deleted++;
			}
			for (const e of await ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", p._id))
				.collect()) {
				await ctx.db.delete(e._id);
				deleted++;
			}
			for (const c of await ctx.db
				.query("confirmTokens")
				.withIndex("by_person_purpose", (q) => q.eq("personId", p._id))
				.collect()) {
				await ctx.db.delete(c._id);
				deleted++;
			}
			// Email changes this person requested for others stay valid; only
			// the dangling requester reference goes.
			for (const c of await ctx.db
				.query("confirmTokens")
				.withIndex("by_actorId", (q) => q.eq("actorId", p._id))
				.collect())
				await ctx.db.patch(c._id, { actorId: undefined });
			for (const n of await ctx.db
				.query("notifications")
				.withIndex("by_personId_and_createdAt", (q) =>
					q.eq("personId", p._id)
				)
				.collect()) {
				await ctx.db.delete(n._id);
				deleted++;
			}
			await ctx.db.delete(p._id);
			deleted++;
		}
		return { deleted };
	},
});
