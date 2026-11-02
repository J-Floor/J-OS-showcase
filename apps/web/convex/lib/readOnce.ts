import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

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
