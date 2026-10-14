import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
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
	type Naming,
	overBudget,
	readBudget,
	type ReadBudget,
	stripPersonId,
	takeCharged,
} from "./lib/peopleRefs.ts";
import { personStateOf } from "./lib/personState.ts";
import { withoutSystemFields } from "./people.ts";

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
	handler: async (context) => {
		const now = Date.now();
		const prospects = await context.db
			.query("people")
			.withIndex("by_tier_and_formerOf", (range) =>
				range.eq("tier", "prospect")
			)
			.take(BATCH_SIZE);
		let count = 0;
		for (const person of prospects) {
			if (!(await abandoned(context.db, person, now))) continue;
			await deleteAbandoned(context, person._id);
			count++;
		}
		const visitors = await context.db
			.query("people")
			.withIndex("by_tier_and_formerOf", (range) =>
				range.eq("tier", "visitor")
			)
			.take(BATCH_SIZE);
		for (const person of visitors) {
			if (!(await abandoned(context.db, person, now))) continue;
			await deleteAbandoned(context, person._id);
			count++;
		}
		const tokens = await purgeConfirmTokens(context, now, BATCH_SIZE);
		await context.db.insert("purgeLog", { at: now, count });
		return { count, tokens };
	},
});

/** Delete an abandoned person with their events and `personState` row. */
async function deleteAbandoned(context: MutationCtx, personId: Id<"people">) {
	const events = await context.db
		.query("personEvents")
		.withIndex("by_person", (range) => range.eq("personId", personId))
		.collect();
	for (const event of events) await context.db.delete(event._id);
	const state = await personStateOf(context, personId);
	if (state) await context.db.delete(state._id);
	await context.db.delete(personId);
}

/**
 * Whether `row`'s legacy `hostedBy` names `host`: it holds their display name
 * and no other host's id says otherwise. Read from the row as stored, before
 * the host's id is stripped from it.
 */
function isLegacyHost(row: object, host: Doc<"people">): boolean {
	const { hostedBy, hostedById } = row as Partial<Doc<"people">>;
	return (
		hostedBy === displayName(host) &&
		(hostedById === undefined || hostedById === host._id)
	);
}

type ErasureOutcome = "deleted" | "stripped" | "kept";

/** Delete a document the person owns, or strip their id from one that only
 *  names them. */
async function eraseDocument(
	context: MutationCtx,
	person: Doc<"people">,
	{ table, doc }: Naming
): Promise<ErasureOutcome> {
	if (doc._id === person._id) return "kept";
	const fields = withoutSystemFields(doc);
	if (ownedBy(fields, person._id)) {
		if (table === "signatures") {
			const { fileId } = doc as unknown as Doc<"signatures">;
			if (fileId) await context.storage.delete(fileId);
		}
		await context.db.delete(doc._id);
		return "deleted";
	}
	const { value, changed } = stripPersonId(fields, person._id);
	// The legacy host field names a host by display name only.
	const isHost = table === "people" && isLegacyHost(fields, person);
	if (isHost) delete (value as { hostedBy?: string }).hostedBy;
	if (!changed && !isHost) return "kept";
	await context.db.replace(doc._id, value);
	return "stripped";
}

async function erasePerson(
	context: MutationCtx,
	{
		person,
		budget,
		tally,
		used,
	}: {
		person: Doc<"people">;
		budget: ReadBudget;
		tally: { deleted: number; stripped: number };
		used: Set<string>;
	}
): Promise<void> {
	const scan = await documentsNaming(context, person._id, budget);
	if ("problem" in scan) throw new Error(`Erasure refused: ${scan.problem}`);
	for (const address of addressesOf(person, scan.docs)) used.add(address);
	for (const naming of scan.docs) {
		const outcome = await eraseDocument(context, person, naming);
		if (outcome === "deleted") tally.deleted++;
		if (outcome === "stripped") tally.stripped++;
	}
	await context.db.delete(person._id);
	tally.deleted++;
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
	handler: async (context, { email }) => {
		const budget = readBudget();
		const people = await takeCharged(peopleByEmail(context, email), budget);
		if (!people)
			throw new Error(`Erasure refused: ${overBudget("people")}`);
		const tally = { deleted: 0, stripped: 0 };
		const ids = new Set<string>(people.map((person) => person._id));
		const used = new Set<string>();
		for (const person of people)
			await erasePerson(context, { person, budget, tally, used });
		const own = await addressesHeldBy(context, [...used], ids, budget);
		if ("problem" in own)
			throw new Error(`Erasure refused: ${own.problem}`);
		const door = await legacyDoorRows(context, own.addresses, budget);
		if ("problem" in door)
			throw new Error(`Erasure refused: ${door.problem}`);
		for (const row of door.rows) {
			await context.db.delete(row._id);
			tally.deleted++;
		}
		let auth = 0;
		for (const address of own.addresses)
			auth += await eraseAuthRecords(context, address);
		return {
			deleted: tally.deleted,
			stripped: tally.stripped,
			auth,
			addresses: own.addresses,
		};
	},
});
