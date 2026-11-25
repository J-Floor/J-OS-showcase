import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { cancelIfPending } from "../../notify/eventReminders.ts";

import { tvCutoff } from "./eventCutoff.ts";
import { pastFrom } from "./eventSlide.ts";

// The slide is static HTML (no scripts in the sandboxed frame), so it changes
// state only when it is rendered again: a sync runs at the event's start
// (Happening now), just after its end (Past event, no QR) and at its TV
// cutoff (off). The ids live on the event, as the reminders' do; the sync
// they call is idempotent, so a duplicate or late run does no harm.

type TransitionIds = NonNullable<Doc<"events">["tvTransitionJobIds"]>;
type TransitionKey = keyof TransitionIds;

const KEYS: readonly TransitionKey[] = ["starts", "ends", "cutoff"];

/** When each transition is due; one whose time is not after `now` is left out. */
function transitionTimes(
	event: Pick<Doc<"events">, "startsAt" | "endsAt" | "tvUntil">,
	now: number
): Partial<Record<TransitionKey, number>> {
	const times: Record<TransitionKey, number> = {
		starts: event.startsAt,
		ends: pastFrom(event.endsAt),
		cutoff: tvCutoff(event),
	};
	return Object.fromEntries(
		KEYS.filter((key) => times[key] > now).map((key) => [key, times[key]])
	);
}

async function cancelAll(
	context: MutationCtx,
	ids: TransitionIds | undefined
): Promise<void> {
	for (const key of KEYS) await cancelIfPending(context, ids?.[key]);
}

/** Replaces the event's transition syncs with ones at its current times. */
export async function scheduleTransitions(
	context: MutationCtx,
	event: Doc<"events">,
	now: number
): Promise<void> {
	await cancelAll(context, event.tvTransitionJobIds);
	const ids: TransitionIds = {};
	const times = Object.entries(transitionTimes(event, now)) as [
		TransitionKey,
		number,
	][];
	for (const [key, time] of times)
		ids[key] = await context.scheduler.runAt(
			time,
			internal.tvEvents.syncEventSlide,
			{ eventId: event._id }
		);
	await context.db.patch(event._id, { tvTransitionJobIds: ids });
}

/** Cancels the event's transition syncs (it left the TV, or is being deleted). */
export async function cancelTransitions(
	context: MutationCtx,
	event: Doc<"events">
): Promise<void> {
	if (event.tvTransitionJobIds === undefined) return;
	await cancelAll(context, event.tvTransitionJobIds);
	await context.db.patch(event._id, { tvTransitionJobIds: undefined });
}
