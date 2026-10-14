import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { entitled } from "../lib/derive.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "../lib/roles.ts";
import { peopleByTiers } from "../people.ts";

/** Drop `undefined` and duplicates, keeping first-seen order. */
export function uniqueIds(
	ids: readonly (Id<"people"> | undefined)[]
): Id<"people">[] {
	return [
		...new Set(ids.filter((id): id is Id<"people"> => id !== undefined)),
	];
}

async function entitledInTiers(
	context: QueryCtx,
	tiers: readonly Doc<"people">["tier"][],
	now: number
): Promise<Id<"people">[]> {
	const people = await peopleByTiers(context, tiers);
	return people
		.filter((person) => entitled(person, now))
		.map((person) => person._id);
}

/** Entitled board + admin: the audience of every board-facing kind. */
export function boardIds(
	context: QueryCtx,
	now = Date.now()
): Promise<Id<"people">[]> {
	return entitledInTiers(context, BOARD_LEVEL, now);
}

/** Everyone entitled in the community (guests inside their window included, staff not). */
export function communityIds(
	context: QueryCtx,
	now = Date.now()
): Promise<Id<"people">[]> {
	return entitledInTiers(context, COMMUNITY_TIERS, now);
}

/** The given people, deduplicated, keeping only those entitled right now. */
export async function entitledIds(
	context: QueryCtx,
	ids: readonly (Id<"people"> | undefined)[],
	now = Date.now()
): Promise<Id<"people">[]> {
	const out: Id<"people">[] = [];
	for (const id of uniqueIds(ids)) {
		const person = await context.db.get(id);
		if (person && entitled(person, now)) out.push(id);
	}
	return out;
}
