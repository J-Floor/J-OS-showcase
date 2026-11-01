import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { displayName } from "./names.ts";
import { isActiveContact } from "./perks.ts";

/** One run's cached reads: each person and each perk is fetched once. */
export type Readers = {
	person: (id: Id<"people">) => Promise<Doc<"people"> | null>;
	perk: (id: Id<"perks">) => Promise<Doc<"perks"> | null>;
};

function cachedRead<Key, Value>(
	cache: Map<Key, Value>,
	key: Key,
	read: () => Value
): Value {
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const value = read();
	cache.set(key, value);
	return value;
}

/** Reads each person and each perk once per run, however many rows name
 *  them. The pending read is what gets cached, so rows joined in parallel
 *  share it instead of reading it twice. */
export function readOnce(context: QueryCtx): Readers {
	const people = new Map<Id<"people">, Promise<Doc<"people"> | null>>();
	const perks = new Map<Id<"perks">, Promise<Doc<"perks"> | null>>();
	return {
		person: (id) => cachedRead(people, id, () => context.db.get(id)),
		perk: (id) => cachedRead(perks, id, () => context.db.get(id)),
	};
}

/** The perk's contact while `isActiveContact` says they can act as one, else
 *  undefined: the one rule the board's lists, the sheet and the requests
 *  agree on. */
export async function activeContactOf(
	readers: Readers,
	contactId: Id<"people"> | undefined,
	now: number
): Promise<Doc<"people"> | undefined> {
	const contact =
		contactId === undefined ? null : await readers.person(contactId);
	return isActiveContact(contact, now) ? contact : undefined;
}

/** The person's display name, or undefined when there is no id or their
 *  row is gone. */
export async function nameOf(
	readers: Readers,
	personId: Id<"people"> | undefined
): Promise<string | undefined> {
	const person =
		personId === undefined ? null : await readers.person(personId);
	return person ? displayName(person) : undefined;
}
