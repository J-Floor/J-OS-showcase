import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

import { notify } from "./notify.ts";

const THIRTY_MINUTES = 30 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** `cancel` throws on a job that already ran, so only cancel a pending one. A
 *  job scheduled earlier in THIS transaction is invisible here — the handler's
 *  re-read guard covers that case. */
async function cancelIfPending(
	ctx: MutationCtx,
	id: Id<"_scheduled_functions"> | undefined
): Promise<void> {
	if (!id) return;
	const job = await ctx.db.system.get(id);
	if (job?.state.kind === "pending") await ctx.scheduler.cancel(id);
}

export async function cancelEventReminders(
	ctx: MutationCtx,
	event: Doc<"events">
): Promise<void> {
	await cancelIfPending(ctx, event.reminderJobIds?.startingSoon);
	await cancelIfPending(ctx, event.reminderJobIds?.endingSoon);
}

/** (Re)schedule both reminders from the event's current times. A reminder
 *  whose fire time has already passed is skipped. */
export async function scheduleEventReminders(
	ctx: MutationCtx,
	event: Doc<"events">,
	now = Date.now()
): Promise<void> {
	await cancelEventReminders(ctx, event);
	const startAt = event.startsAt - THIRTY_MINUTES;
	const endAt = event.endsAt - FIFTEEN_MINUTES;
	const startingSoon =
		startAt > now
			? await ctx.scheduler.runAt(
					startAt,
					internal.notify.eventReminders.startingSoon,
					{ eventId: event._id, startsAt: event.startsAt }
				)
			: undefined;
	const endingSoon =
		endAt > now
			? await ctx.scheduler.runAt(
					endAt,
					internal.notify.eventReminders.endingSoon,
					{ eventId: event._id, endsAt: event.endsAt }
				)
			: undefined;
	await ctx.db.patch(event._id, {
		reminderJobIds: {
			...(startingSoon ? { startingSoon } : {}),
			...(endingSoon ? { endingSoon } : {}),
		},
	});
}

export const startingSoon = internalMutation({
	args: { eventId: v.id("events"), startsAt: v.number() },
	handler: async (ctx, { eventId, startsAt }): Promise<null> => {
		const event = await ctx.db.get(eventId);
		if (event?.startsAt !== startsAt) return null;
		await notify(ctx, "eventStartingSoon", {
			eventId,
			name: event.name,
			startsAtLocal: event.startsAtLocal,
		});
		return null;
	},
});

export const endingSoon = internalMutation({
	args: { eventId: v.id("events"), endsAt: v.number() },
	handler: async (ctx, { eventId, endsAt }): Promise<null> => {
		const event = await ctx.db.get(eventId);
		if (event?.endsAt !== endsAt) return null;
		await notify(ctx, "eventEndingSoon", {
			eventId,
			name: event.name,
			endsAtLocal: event.endsAtLocal,
		});
		return null;
	},
});
