import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { isLiveStage } from "../lib/derive.ts";
import { displayName } from "../lib/names.ts";
import {
	formatDateOnlyLong,
	guestChosenIso,
	isoToUtcMidnight,
	SITE_TIMEZONE,
} from "../lib/time.ts";

import { notify } from "./notify.ts";

export const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

/**
 * The day a guest's access ends, as the board chose it: the stored instant is
 * the exclusive end (00:00:01 the day after), so show the inclusive day, the
 * same way the approval email does.
 */
export function guestUntilLabel(
	accessUntilLocal: string | undefined,
	accessUntil: number
): string {
	return formatDateOnlyLong(
		isoToUtcMidnight(
			guestChosenIso(accessUntilLocal, accessUntil, SITE_TIMEZONE)
		) ?? accessUntil
	);
}

/**
 * Scheduled beside SCHEDULE_WINDOW_EXPIRY. An extension schedules a new
 * reminder and leaves the old one to no-op on its stale `accessUntil` (a
 * mutation cannot cancel what an earlier one scheduled without tracking it,
 * and the guard makes tracking unnecessary).
 */
export async function scheduleGuestExpiringSoon(
	ctx: MutationCtx,
	personId: Id<"people">,
	accessUntil: number,
	previousAccessUntil: number | undefined,
	now = Date.now()
): Promise<void> {
	if (accessUntil === previousAccessUntil) return;
	const at = accessUntil - THREE_DAYS;
	if (at <= now) return;
	await ctx.scheduler.runAt(at, internal.notify.guests.expiringSoon, {
		personId,
		accessUntil,
	});
}

export const expiringSoon = internalMutation({
	args: { personId: v.id("people"), accessUntil: v.number() },
	handler: async (ctx, { personId, accessUntil }): Promise<null> => {
		const guest = await ctx.db.get(personId);
		if (guest?.tier !== "guest") return null;
		if (!isLiveStage(guest.stage)) return null;
		if (guest.accessUntil !== accessUntil) return null;
		if (guest.guestExpiryRemindedFor === accessUntil) return null;
		await ctx.db.patch(personId, { guestExpiryRemindedFor: accessUntil });
		await notify(ctx, "guestExpiringSoon", {
			guestId: personId,
			guestName: displayName(guest),
			untilDate: guestUntilLabel(guest.accessUntilLocal, accessUntil),
		});
		return null;
	},
});

export async function notifyGuestExpired(
	ctx: MutationCtx,
	personId: Id<"people">
): Promise<void> {
	const guest = await ctx.db.get(personId);
	if (!guest) return;
	await notify(ctx, "guestExpired", {
		guestId: personId,
		guestName: displayName(guest),
	});
}

/** Called after EXTEND_WINDOW / PROMOTE_TO_MEMBER have been applied, so the
 *  row already carries the new window (or none, after an upgrade). */
export async function notifyGuestAccessChanged(
	ctx: MutationCtx,
	personId: Id<"people">,
	change: "extended" | "upgraded" | "shortened"
): Promise<void> {
	const person = await ctx.db.get(personId);
	if (!person) return;
	const guestName = displayName(person);
	if (change === "upgraded") {
		await notify(ctx, "guestAccessChanged", {
			guestId: personId,
			guestName,
			change,
		});
		return;
	}
	if (person.accessUntil == null) return;
	await notify(ctx, "guestAccessChanged", {
		guestId: personId,
		guestName,
		change,
		untilDate: guestUntilLabel(person.accessUntilLocal, person.accessUntil),
	});
}

/** Called after EXTEND_WINDOW has been applied. Announces only a real change
 *  to a window that is still open: an unchanged date says nothing, and a date
 *  already in the past is announced by the expiry itself. */
export async function notifyGuestWindowChanged(
	ctx: MutationCtx,
	personId: Id<"people">,
	previousAccessUntil: number | undefined,
	now = Date.now()
): Promise<void> {
	const person = await ctx.db.get(personId);
	if (person?.accessUntil == null) return;
	if (person.accessUntil <= now) return;
	if (person.accessUntil === previousAccessUntil) return;
	const later =
		previousAccessUntil !== undefined &&
		person.accessUntil > previousAccessUntil;
	await notifyGuestAccessChanged(
		ctx,
		personId,
		later ? "extended" : "shortened"
	);
}
