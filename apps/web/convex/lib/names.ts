import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * The single display string for a person, built from their name pair. firstName
 * and lastName are required on both `people` and `applications`, so this is
 * always populated. Use it where a record or document wants one name field (a
 * Door-log row, the signed agreement PDF). Greetings that want just a first
 * name should read `firstName` directly.
 */
export function displayName(person: {
	firstName: string;
	lastName: string;
}): string {
	return `${person.firstName} ${person.lastName}`.trim();
}

/**
 * The shortest label that still tells these people apart.
 *
 * A first name where it is unambiguous, and `First L.` where it is not. Both
 * Alans on the board rendered as "Alan" on the Insights host chart, which
 * put two different people's guest counts under one indistinguishable label —
 * the reader cannot even tell there are two.
 *
 * Ambiguity is judged across the WHOLE set passed in, not pairwise, so adding a
 * second Alan disambiguates the first as well. It has to be: shortening one
 * and not the other would read as though "Alan" and "Alan T." were the same
 * person mentioned twice.
 *
 * Falls back to the full name when the surname cannot break the tie either
 * (identical names, or a missing surname) — a duplicate label is bad, but a
 * label that claims a distinction it cannot make is worse.
 */
export function shortNames(
	people: readonly { _id: string; firstName: string; lastName: string }[]
): Map<string, string> {
	const countByFirst = countBy(people, (person) => person.firstName.trim());
	// Second pass over the ambiguous ones only: an initial is no use if every
	// Alan's surname starts with the same letter, so those get the full name.
	const countByInitial = countBy(people, initialKey);
	const out = new Map<string, string>();
	for (const person of people)
		out.set(person._id, shortLabel(person, countByFirst, countByInitial));
	return out;
}

function countBy<T>(
	items: readonly T[],
	keyOf: (item: T) => string
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) {
		const key = keyOf(item);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function shortLabel(
	person: { firstName: string; lastName: string },
	countByFirst: ReadonlyMap<string, number>,
	countByInitial: ReadonlyMap<string, number>
): string {
	const first = person.firstName.trim();
	if ((countByFirst.get(first) ?? 0) <= 1) return first;
	const initial = person.lastName.trim().charAt(0);
	const isAmbiguous =
		initial === "" || (countByInitial.get(initialKey(person)) ?? 0) > 1;
	return isAmbiguous ? displayName(person) : `${first} ${initial}.`;
}

function initialKey(person: { firstName: string; lastName: string }): string {
	return `${person.firstName.trim()} ${person.lastName.trim().charAt(0)}`;
}

/**
 * Each row with its actor's display name attached (`undefined` when the row has
 * no actor or the actor's row is gone). Every actor is read once, however many
 * rows they appear on.
 */
export async function withActorNames<Row extends { actorId?: Id<"people"> }>(
	context: QueryCtx,
	rows: readonly Row[]
): Promise<(Row & { actorName: string | undefined })[]> {
	const names = new Map<string, string>();
	return Promise.all(
		rows.map(async (row) => {
			if (row.actorId === undefined)
				return { ...row, actorName: undefined };
			const cached = names.get(row.actorId);
			if (cached !== undefined) return { ...row, actorName: cached };
			const actor = await context.db.get(row.actorId);
			if (!actor) return { ...row, actorName: undefined };
			const actorName = displayName(actor);
			names.set(row.actorId, actorName);
			return { ...row, actorName };
		})
	);
}
