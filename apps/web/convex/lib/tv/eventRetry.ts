import { internal } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";

// A manual write to the pack (a removed slide, a replaced pack) can free room
// for an event that was left off because the TV was full. Events only retry
// at their own transitions and the daily reconcile, so a manual write
// schedules one retry of the full events. Event commits never do (they would
// loop: a retry commits, which would schedule a retry).

/** Waits for a burst of manual edits to finish before the events retry. */
const EVENT_RETRY_DELAY_MS = 10_000;

/** Schedules `tvEvents.retryFullEvents` unless one is pending, and only when an event is left off for want of room. One lookup on `by_tvStatus`. */
export async function scheduleFullEventRetry(
	context: MutationCtx
): Promise<void> {
	const full = await context.db
		.query("events")
		.withIndex("by_tvStatus", (range) => range.eq("tvStatus", "full"))
		.first();
	if (full === null) return;
	const row = await context.db.query("tvConfig").first();
	if (row === null) return;
	// A job scheduled earlier in this transaction is invisible here: at worst a second one runs, and the retry is idempotent.
	const pending =
		row.eventRetryJobId === undefined
			? null
			: await context.db.system.get(row.eventRetryJobId);
	if (pending?.state.kind === "pending") return;
	const eventRetryJobId = await context.scheduler.runAfter(
		EVENT_RETRY_DELAY_MS,
		internal.tvEvents.retryFullEvents,
		{}
	);
	await context.db.patch(row._id, { eventRetryJobId });
}
