import type { Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MyOpenPerkRequest } from "../../../convex/perkRequests.ts";
import { useQuery } from "../../shared/data/useQuery.ts";

/**
 * The viewer's open request for one perk, if they have one: the newest,
 * should a board status change have left them two. Every perk reads the one
 * list the manifest prefetches, so moving to another perk never waits on a
 * query. Undefined while that list loads, too.
 */
export function useMyOpenRequest(
	perkId: Accessor<Id<"perks"> | undefined>
): Accessor<MyOpenPerkRequest | undefined> {
	const mine = useQuery(api.perkRequests.myOpenPerkRequests, {});
	return () => {
		const id = perkId();
		return mine
			.data()
			?.filter((request) => request.perkId === id)
			.toSorted((first, second) => second.requestedAt - first.requestedAt)
			.at(0);
	};
}
