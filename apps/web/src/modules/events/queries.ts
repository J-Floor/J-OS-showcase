import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QuerySpec } from "../../shared/data/queryKeeper.ts";

/** The event drawer's attendee list, read by `EventDrawer` and prefetched by
 *  the events descriptor. */
export const eventAttendeesQuery: QuerySpec<
	typeof api.events.listEventAttendees,
	Id<"events">
> = {
	query: api.events.listEventAttendees,
	args: (eventId) => ({ eventId }),
};
