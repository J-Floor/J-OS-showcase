import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { eraseAuthRecords } from "./lib/authRecords.ts";
import { abandoned, purgeConfirmTokens } from "./lib/confirmToken.ts";
import { peopleByEmail } from "./lib/emailAddress.ts";
import {
	addressesHeldBy,
	addressesOf,
	legacyDoorRows,
	ownedBy,
} from "./lib/erasure.ts";
import { displayName } from "./lib/names.ts";
import {
	documentsNaming,
	overBudget,
	readBudget,
	stripPersonId,
	takeCharged,
} from "./lib/peopleRefs.ts";

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

/**
 * Whether `row`'s legacy `hostedBy` names `host`: it holds their display name
 * and no other host's id says otherwise. Read from the row as stored, before
 * the host's id is stripped from it.
 */
function legacyHostIs(row: object, host: Doc<"people">): boolean {
	const { hostedBy, hostedById } = row as Partial<Doc<"people">>;
	return (
		hostedBy === displayName(host) &&
		(hostedById === undefined || hostedById === host._id)
	);
}

/**
 * Erase one person by email (a deletion request, or a test or duplicate
 * account). Every document the schema says can name them is walked
 * (`lib/peopleRefs#documentsNaming`): what they own (`personId` is theirs) is
 * deleted with any stored file it points to (the signed agreement PDF), and
 * every other document has their id stripped, so a task they were on loses
 * them as assignee and creator but stays.
 *
 * Every address they have used (`lib/erasure#addressesOf`, read before their
 * history is deleted) is erased too, unless someone else holds it now: the
 * sign-in records and per-address rate-limit buckets, and the door-log rows
 * written before `personId` was stored, which carry only the address. A
 * door-log row carrying someone else's `personId` is never touched. The lock
 * provider keeps its own log.
 *
 * Not written to `purgeLog`: its nightly count is the health signal for
 * verification emails, and a manual erasure would read as a spike.
 * Free-text mentions of the name (a board note on someone else) are not
 * found by id and are left for the operator.
 */
export const purgeEmail = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		let deleted = 0;
		let stripped = 0;
		const budget = readBudget();
		const people = await takeCharged(peopleByEmail(ctx, email), budget);
		if (!people)
			throw new Error(`Erasure refused: ${overBudget("people")}`);
		const ids = new Set<string>(people.map((p) => p._id));
		const used = new Set<string>();
		for (const p of people) {
			const scan = await documentsNaming(ctx, p._id, budget);
			if ("problem" in scan)
				throw new Error(`Erasure refused: ${scan.problem}`);
			for (const address of addressesOf(p, scan.docs)) used.add(address);
			for (const { table, doc } of scan.docs) {
				const { _id, _creationTime, ...fields } = doc;
				void _creationTime;
				if (_id === p._id) continue;
				if (ownedBy(fields, p._id)) {
					if (table === "signatures") {
						const { fileId } = doc as unknown as Doc<"signatures">;
						if (fileId) await ctx.storage.delete(fileId);
					}
					await ctx.db.delete(_id);
					deleted++;
					continue;
				}
				const { value, changed } = stripPersonId(fields, p._id);
				// The legacy host field names a host by display name only.
				const host = table === "people" && legacyHostIs(fields, p);
				if (host) delete (value as { hostedBy?: string }).hostedBy;
				if (!changed && !host) continue;
				await ctx.db.replace(_id, value);
				stripped++;
			}
			await ctx.db.delete(p._id);
			deleted++;
		}
		const own = await addressesHeldBy(ctx, [...used], ids, budget);
		if ("problem" in own)
			throw new Error(`Erasure refused: ${own.problem}`);
		const door = await legacyDoorRows(ctx, own.addresses, budget);
		if ("problem" in door)
			throw new Error(`Erasure refused: ${door.problem}`);
		for (const row of door.rows) {
			await ctx.db.delete(row._id);
			deleted++;
		}
		let auth = 0;
		for (const address of own.addresses)
			auth += await eraseAuthRecords(ctx, address);
		return { deleted, stripped, auth, addresses: own.addresses };
	},
});
