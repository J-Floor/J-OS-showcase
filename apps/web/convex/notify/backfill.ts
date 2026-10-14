import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { isLiveStage } from "../lib/derive.ts";

import { scheduleEventReminders } from "./eventReminders.ts";
import { scheduleGuestExpiringSoon, THREE_DAYS } from "./guests.ts";

export const BACKFILL_BATCH = 100;

type Phase = "events" | "guests";

export type BackfillPage = {
	phase: Phase;
	events: number;
	guests: number;
	done: boolean;
};

type PageOutcome = {
	isDone: boolean;
	continueCursor: string;
	scheduled: number;
};

async function scheduleEventsPage(
	context: MutationCtx,
	cursor: string | null,
	now: number
): Promise<PageOutcome> {
	const page = await context.db
		.query("events")
		.paginate({ numItems: BACKFILL_BATCH, cursor });
	let scheduled = 0;
	for (const event of page.page) {
		if (event.startsAt <= now || event.reminderJobIds !== undefined)
			continue;
		await scheduleEventReminders(context, event, now);
		scheduled += 1;
	}
	return {
		isDone: page.isDone,
		continueCursor: page.continueCursor,
		scheduled,
	};
}

async function scheduleGuestsPage(
	context: MutationCtx,
	cursor: string | null,
	now: number
): Promise<PageOutcome> {
	const page = await context.db
		.query("people")
		.withIndex("by_tier_and_formerOf", (range) => range.eq("tier", "guest"))
		.paginate({ numItems: BACKFILL_BATCH, cursor });
	let scheduled = 0;
	for (const guest of page.page) {
		if (!isLiveStage(guest.stage)) continue;
		const { accessUntil } = guest;
		if (
			accessUntil === undefined ||
			accessUntil - THREE_DAYS <= now ||
			guest.guestExpiryRemindedFor === accessUntil
		)
			continue;
		await scheduleGuestExpiringSoon(
			context,
			guest._id,
			accessUntil,
			undefined
		);
		scheduled += 1;
	}
	return {
		isDone: page.isDone,
		continueCursor: page.continueCursor,
		scheduled,
	};
}

/** One-off, run once per deployment after the notifications feature ships:
 *  schedules the reminders for events and guests that predate it. Kick it off
 *  with `{}`; it walks events, then guests, one page per run, rescheduling
 *  itself with the next cursor. Each page logs and returns its own counts.
 *
 *  Safe to run again: an event whose `reminderJobIds` is set (even to `{}`,
 *  when both fire times had passed) is skipped. A guest already reminded for
 *  their current window is skipped; any other re-run schedules a duplicate
 *  expiring-soon job, which the `guestExpiryRemindedFor` marker turns into a
 *  no-op when it fires. */
export const scheduleExisting = internalMutation({
	args: {
		phase: v.optional(v.union(v.literal("events"), v.literal("guests"))),
		cursor: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (context, args): Promise<BackfillPage> => {
		const phase: Phase = args.phase ?? "events";
		const cursor = args.cursor ?? null;
		const now = Date.now();
		const page =
			phase === "events"
				? await scheduleEventsPage(context, cursor, now)
				: await scheduleGuestsPage(context, cursor, now);
		const events = phase === "events" ? page.scheduled : 0;
		const guests = phase === "guests" ? page.scheduled : 0;

		if (!page.isDone)
			await context.scheduler.runAfter(
				0,
				internal.notify.backfill.scheduleExisting,
				{ phase, cursor: page.continueCursor }
			);
		else if (phase === "events")
			await context.scheduler.runAfter(
				0,
				internal.notify.backfill.scheduleExisting,
				{ phase: "guests", cursor: null }
			);

		const isFinished = page.isDone && phase === "guests";
		// eslint-disable-next-line no-console -- per-page progress of a one-off migration, read from the Convex logs
		console.log(
			`[notify:backfill] ${phase} page: ${String(events)} event(s), ${String(guests)} guest(s) scheduled${isFinished ? "; done" : ""}`
		);
		return { phase, events, guests, done: isFinished };
	},
});
