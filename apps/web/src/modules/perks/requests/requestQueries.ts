import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	prefetchSpec,
	type QuerySpec,
} from "../../../shared/data/queryKeeper.ts";

/** One request, read by its sheet and prefetched by the descriptor. */
export const perkRequestQuery: QuerySpec<
	typeof api.perkRequests.getPerkRequest,
	Id<"perkRequests">
> = {
	query: api.perkRequests.getPerkRequest,
	args: (requestId) => ({ requestId }),
};

/** One request's history, read by its sheet. */
export const perkRequestHistoryQuery: QuerySpec<
	typeof api.perkRequests.perkRequestHistory,
	Id<"perkRequests">
> = {
	query: api.perkRequests.perkRequestHistory,
	args: (requestId) => ({ requestId }),
};

/** Warms what a request's sheet reads: the request and its history. */
export function prefetchRequestSheet(requestId: Id<"perkRequests">): void {
	prefetchSpec(perkRequestQuery, requestId);
	prefetchSpec(perkRequestHistoryQuery, requestId);
}
