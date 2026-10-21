import { v, type Infer } from "convex/values";

/** One change the counter reports: an absolute headcount, or one person in
 *  (`1`) or out (`-1`). `eventId`, when the hardware sends one, lets a
 *  retried delivery be applied once. */
export const occupancyUpdate = v.union(
	v.object({ type: v.literal("count"), count: v.number() }),
	v.object({
		type: v.literal("delta"),
		change: v.union(v.literal(1), v.literal(-1)),
		eventId: v.optional(v.string()),
	})
);

export type OccupancyUpdate = Infer<typeof occupancyUpdate>;
