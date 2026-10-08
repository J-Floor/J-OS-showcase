/**
 * The single display string for a person, built from their name pair. firstName
 * and lastName are required on both `people` and `applications`, so this is
 * always populated. Use it where a record or document wants one name field (a
 * Door-log row, the signed agreement PDF). Greetings that want just a first
 * name should read `firstName` directly.
 */
export function displayName(p: {
	firstName: string;
	lastName: string;
}): string {
	return `${p.firstName} ${p.lastName}`.trim();
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
	const countByFirst = new Map<string, number>();
	for (const p of people) {
		const first = p.firstName.trim();
		countByFirst.set(first, (countByFirst.get(first) ?? 0) + 1);
	}

	// Second pass over the ambiguous ones only: an initial is no use if every
	// Alan's surname starts with the same letter, so those get the full name.
	const countByInitial = new Map<string, number>();
	for (const p of people) {
		const key = initialKey(p);
		countByInitial.set(key, (countByInitial.get(key) ?? 0) + 1);
	}

	const out = new Map<string, string>();
	for (const p of people) {
		const first = p.firstName.trim();
		if ((countByFirst.get(first) ?? 0) <= 1) {
			out.set(p._id, first);
			continue;
		}
		const initial = p.lastName.trim().charAt(0);
		if (initial === "" || (countByInitial.get(initialKey(p)) ?? 0) > 1) {
			out.set(p._id, displayName(p));
			continue;
		}
		out.set(p._id, `${first} ${initial}.`);
	}
	return out;
}

function initialKey(p: { firstName: string; lastName: string }): string {
	return `${p.firstName.trim()} ${p.lastName.trim().charAt(0)}`;
}
