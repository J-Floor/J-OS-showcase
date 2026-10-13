import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * The person's `personState` row. One row per person is the invariant: a
 * person merge dedupes, `setPersonLastPath` upserts, and
 * `migrations:moveLastPath` only inserts when the person has no row.
 */
export function personStateOf(ctx: QueryCtx, personId: Id<"people">) {
	return ctx.db
		.query("personState")
		.withIndex("by_person", (q) => q.eq("personId", personId))
		.unique();
}

/**
 * Store the person's last-viewed module path. Writes nothing when it is already
 * stored.
 */
export async function setPersonLastPath(
	ctx: MutationCtx,
	personId: Id<"people">,
	path: string
): Promise<void> {
	const state = await personStateOf(ctx, personId);
	if (state?.lastPath === path) return;
	if (state) await ctx.db.patch(state._id, { lastPath: path });
	else await ctx.db.insert("personState", { personId, lastPath: path });
}
