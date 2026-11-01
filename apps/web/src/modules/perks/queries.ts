import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QuerySpec } from "../../shared/data/queryKeeper.ts";

/** A perk's request list, read by the board's section of the perk sheet
 *  and prefetched by the perks descriptor. */
export const perkRequestsForPerkQuery: QuerySpec<
	typeof api.perkRequests.listRequestsForPerk,
	Id<"perks">
> = {
	query: api.perkRequests.listRequestsForPerk,
	args: (perkId) => ({ perkId }),
};
