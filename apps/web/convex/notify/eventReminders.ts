import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

import { notify } from "./notify.ts";

const THIRTY_MINUTES = 1_800_000;
const FIFTEEN_MINUTES = 900_000;

/** `cancel` throws on a job that already ran, so only cancel a pending one. A
 *  job scheduled earlier in THIS transaction is invisible here — the handler's
 *  re-read guard covers that case. */
async function cancelIfPending(
	context: MutationCtx,
	id: Id<"_scheduled_functions"> | undefined
): Promise<void> {
	if (!id) return;
	const job = await context.db.system.get(id);
	if (job?.state.kind === "pending") await context.scheduler.cancel(id);
}

export async function cancelEventReminders(
	context: MutationCtx,
	event: Doc<"events">
): Promise<void> {
	await cancelIfPending(context, event.reminderJobIds?.startingSoon);
	await cancelIfPending(context, event.reminderJobIds?.endingSoon);
}

/** (Re)schedule both reminders from the event's current times. A reminder
 *  whose fire time has already passed is skipped. */
export async function scheduleEventReminders(
	context: MutationCtx,
	event: Doc<"events">,
	now = Date.now()
): Promise<void> {
	await cancelEventReminders(context, event);
	const startAt = event.startsAt - THIRTY_MINUTES;
	const endAt = event.endsAt - FIFTEEN_MINUTES;
	const startingSoon =
		startAt > now
			? await context.scheduler.runAt(
					startAt,
					internal.notify.eventReminders.startingSoon,
					{ eventId: event._id, startsAt: event.startsAt }
				)
			: undefined;
	const endingSoon =
		endAt > now
			? await context.scheduler.runAt(
					endAt,
					internal.notify.eventReminders.endingSoon,
					{ eventId: event._id, endsAt: event.endsAt }
				)
			: undefined;
	await context.db.patch(event._id, {
		reminderJobIds: {
			...(startingSoon ? { startingSoon } : {}),
			...(endingSoon ? { endingSoon } : {}),
		},
	});
}

export const startingSoon = internalMutation({
	args: { eventId: v.id("events"), startsAt: v.number() },
	handler: async (context, { eventId, startsAt }): Promise<void> => {
		const event = await context.db.get(eventId);
		if (event?.startsAt !== startsAt) return;
		await notify(context, "eventStartingSoon", {
			eventId,
			name: event.name,
			startsAtLocal: event.startsAtLocal,
		});
	},
});

export const endingSoon = internalMutation({
	args: { eventId: v.id("events"), endsAt: v.number() },
	handler: async (context, { eventId, endsAt }): Promise<void> => {
		const event = await context.db.get(eventId);
		if (event?.endsAt !== endsAt) return;
		await notify(context, "eventEndingSoon", {
			eventId,
			name: event.name,
			endsAtLocal: event.endsAtLocal,
		});
	},
});
