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

export const THREE_DAYS = 259_200_000;

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
	context: MutationCtx,
	personId: Id<"people">,
	accessUntil: number,
	previousAccessUntil: number | undefined
): Promise<void> {
	if (accessUntil === previousAccessUntil) return;
	const at = accessUntil - THREE_DAYS;
	if (at <= Date.now()) return;
	await context.scheduler.runAt(at, internal.notify.guests.expiringSoon, {
		personId,
		accessUntil,
	});
}

export const expiringSoon = internalMutation({
	args: { personId: v.id("people"), accessUntil: v.number() },
	handler: async (context, { personId, accessUntil }): Promise<void> => {
		const guest = await context.db.get(personId);
		if (
			guest?.tier !== "guest" ||
			!isLiveStage(guest.stage) ||
			guest.accessUntil !== accessUntil ||
			guest.guestExpiryRemindedFor === accessUntil
		)
			return;
		await context.db.patch(personId, {
			guestExpiryRemindedFor: accessUntil,
		});
		await notify(context, "guestExpiringSoon", {
			guestId: personId,
			guestName: displayName(guest),
			untilDate: guestUntilLabel(guest.accessUntilLocal, accessUntil),
		});
	},
});

export async function notifyGuestExpired(
	context: MutationCtx,
	personId: Id<"people">
): Promise<void> {
	const guest = await context.db.get(personId);
	if (!guest) return;
	await notify(context, "guestExpired", {
		guestId: personId,
		guestName: displayName(guest),
	});
}

/** Called after EXTEND_WINDOW / PROMOTE_TO_MEMBER have been applied, so the
 *  row already carries the new window (or none, after an upgrade). */
export async function notifyGuestAccessChanged(
	context: MutationCtx,
	personId: Id<"people">,
	change: "extended" | "upgraded" | "shortened"
): Promise<void> {
	const person = await context.db.get(personId);
	if (!person) return;
	const guestName = displayName(person);
	if (change === "upgraded") {
		await notify(context, "guestAccessChanged", {
			guestId: personId,
			guestName,
			change,
		});
		return;
	}
	if (person.accessUntil === undefined) return;
	await notify(context, "guestAccessChanged", {
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
	context: MutationCtx,
	personId: Id<"people">,
	previousAccessUntil: number | undefined,
	now = Date.now()
): Promise<void> {
	const person = await context.db.get(personId);
	if (
		person?.accessUntil === undefined ||
		person.accessUntil <= now ||
		person.accessUntil === previousAccessUntil
	)
		return;
	const isLater =
		previousAccessUntil !== undefined &&
		person.accessUntil > previousAccessUntil;
	await notifyGuestAccessChanged(
		context,
		personId,
		isLater ? "extended" : "shortened"
	);
}
