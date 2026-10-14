import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { entitledIds, uniqueIds } from "../audience.ts";

/**
 * The guest and their entitled host, deduplicated. `guest: "always"` keeps
 * the guest even when they are no longer entitled (their window just closed);
 * every other audience stays entitled-only.
 */
export async function guestAudience(
	context: QueryCtx,
	guestId: Id<"people">,
	options: { guest: "entitled" | "always" }
): Promise<Id<"people">[]> {
	const guest = await context.db.get(guestId);
	if (!guest) return [];
	const self =
		options.guest === "always"
			? [guestId]
			: await entitledIds(context, [guestId]);
	const host = await entitledIds(context, [guest.hostedById]);
	return uniqueIds([...self, ...host]);
}
