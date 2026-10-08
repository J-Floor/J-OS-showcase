import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { entitledIds, uniqueIds } from "../audience.ts";

/**
 * The guest and their entitled host, deduplicated. `guest: "always"` keeps
 * the guest even when they are no longer entitled (their window just closed);
 * every other audience stays entitled-only.
 */
export async function guestAudience(
	ctx: QueryCtx,
	guestId: Id<"people">,
	opts: { guest: "entitled" | "always" }
): Promise<Id<"people">[]> {
	const guest = await ctx.db.get(guestId);
	if (!guest) return [];
	const self =
		opts.guest === "always" ? [guestId] : await entitledIds(ctx, [guestId]);
	const host = await entitledIds(ctx, [guest.hostedById]);
	return uniqueIds([...self, ...host]);
}
