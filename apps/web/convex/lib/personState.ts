import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The person's `personState` row. One row per person is the invariant: a
 * person merge dedupes and `setPersonLastPath` upserts.
 */
export function personStateOf(context: QueryCtx, personId: Id<"people">) {
	return context.db
		.query("personState")
		.withIndex("by_person", (range) => range.eq("personId", personId))
		.unique();
}

/**
 * Store the person's last-viewed module path. Writes nothing when it is already
 * stored.
 */
export async function setPersonLastPath(
	context: MutationCtx,
	personId: Id<"people">,
	path: string
): Promise<void> {
	const state = await personStateOf(context, personId);
	if (state?.lastPath === path) return;
	if (state) await context.db.patch(state._id, { lastPath: path });
	else await context.db.insert("personState", { personId, lastPath: path });
}
