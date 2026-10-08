import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
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
	handler: async (ctx, args): Promise<BackfillPage> => {
		const phase: Phase = args.phase ?? "events";
		const cursor = args.cursor ?? null;
		const now = Date.now();
		let events = 0;
		let guests = 0;
		let isDone: boolean;
		let continueCursor: string;

		if (phase === "events") {
			const page = await ctx.db
				.query("events")
				.paginate({ numItems: BACKFILL_BATCH, cursor });
			for (const event of page.page) {
				if (event.startsAt <= now) continue;
				if (event.reminderJobIds !== undefined) continue;
				await scheduleEventReminders(ctx, event, now);
				events += 1;
			}
			({ isDone, continueCursor } = page);
		} else {
			const page = await ctx.db
				.query("people")
				.withIndex("by_tier", (q) => q.eq("tier", "guest"))
				.paginate({ numItems: BACKFILL_BATCH, cursor });
			for (const guest of page.page) {
				if (!isLiveStage(guest.stage)) continue;
				const { accessUntil } = guest;
				if (accessUntil == null || accessUntil - THREE_DAYS <= now)
					continue;
				if (guest.guestExpiryRemindedFor === accessUntil) continue;
				await scheduleGuestExpiringSoon(
					ctx,
					guest._id,
					accessUntil,
					undefined,
					now
				);
				guests += 1;
			}
			({ isDone, continueCursor } = page);
		}

		if (!isDone)
			await ctx.scheduler.runAfter(
				0,
				internal.notify.backfill.scheduleExisting,
				{ phase, cursor: continueCursor }
			);
		else if (phase === "events")
			await ctx.scheduler.runAfter(
				0,
				internal.notify.backfill.scheduleExisting,
				{ phase: "guests", cursor: null }
			);

		const done = isDone && phase === "guests";
		// eslint-disable-next-line no-console -- per-page progress of a one-off migration, read from the Convex logs
		console.log(
			`[notify:backfill] ${phase} page: ${String(events)} event(s), ${String(guests)} guest(s) scheduled${done ? "; done" : ""}`
		);
		return { phase, events, guests, done };
	},
});
