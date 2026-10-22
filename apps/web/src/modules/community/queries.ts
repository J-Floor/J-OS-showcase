import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QuerySpec } from "../../shared/data/queryKeeper.ts";

/** The person sheet's "Came from" row, read by `PersonReadOnly` and prefetched
 *  by the person descriptor. */
export const attendedEventsQuery: QuerySpec<
	typeof api.people.attendedEvents,
	Id<"people">
> = {
	query: api.people.attendedEvents,
	args: (personId) => ({ personId }),
};
