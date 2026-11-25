import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { cancelIfPending } from "../../notify/eventReminders.ts";

import { cancelTransitions } from "./eventTransitions.ts";

// When an event's TV slide is synced: the shape of notify/eventReminders.ts
// (the job id lives on the event, the next edit replaces a pending job).
// The sync itself reads the event, so a stale or extra run does no harm.

/** The sheet saves each field on its own: wait this long so a burst of edits renders once. */
const TV_EVENT_SYNC_DELAY_MS = 5_000;

/** True when an edit can change what the TV shows: the event was or is now on it. */
export function touchesTv(
	before: Pick<Doc<"events">, "showOnTv">,
	after: Pick<Doc<"events">, "showOnTv">
): boolean {
	return before.showOnTv === true || after.showOnTv === true;
}

/** (Re)schedules the event's sync, replacing a pending one. */
export async function scheduleEventTvSync(
	context: MutationCtx,
	event: Doc<"events">
): Promise<void> {
	await cancelIfPending(context, event.tvSyncJobId);
	const tvSyncJobId = await context.scheduler.runAfter(
		TV_EVENT_SYNC_DELAY_MS,
		internal.tvEvents.syncEventSlide,
		{ eventId: event._id }
	);
	await context.db.patch(event._id, { tvSyncJobId });
}

/** For a deleted event: drop its transition syncs; if it was on the TV, sync now (its row is gone, so no job id can be kept). */
export async function syncDeletedEventTv(
	context: MutationCtx,
	event: Doc<"events">
): Promise<void> {
	await cancelTransitions(context, event);
	if (event.showOnTv !== true) return;
	await cancelIfPending(context, event.tvSyncJobId);
	await context.scheduler.runAfter(0, internal.tvEvents.syncEventSlide, {
		eventId: event._id,
	});
}
