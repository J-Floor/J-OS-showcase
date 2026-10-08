import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, mutation } from "./_generated/server";
import { eventLive, insertAttendanceOnce } from "./lib/attendance.ts";
import { requireRole } from "./lib/authGuard.ts";
import { redeemToken, type ConfirmStatus } from "./lib/confirmToken.ts";
import { COMMUNITY_TIERS } from "./lib/roles.ts";
import type { Wifi } from "./lib/wifi.ts";

type InviteConfirmStatus = Exclude<ConfirmStatus, "already">;

/**
 * Public: a logged-in, entitled member checking themselves into an event —
 * e.g. from the /visitor page when the caller is already a signed-in member
 * rather than an anonymous visitor. Staff are not in the community, so they
 * cannot check in. Resolves the CURRENT authenticated person
 * from their auth identity (never a client-supplied personId), so nobody can
 * check another person in.
 *
 * Unlike the confirm-link flows (which answer "ended" for a deleted event),
 * the caller here is picking a live event right now, so a deleted or
 * nonexistent `eventId` is a real error. Dedup still comes from `insertAttendanceOnce`.
 */
export const checkInToEvent = mutation({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }): Promise<{ ok: boolean }> => {
		const person = await requireRole(ctx, COMMUNITY_TIERS);
		const event = await ctx.db.get(eventId);
		if (event === null) throw new Error("Event not found");
		// Hard stop, no grace.
		if (!eventLive(event, Date.now())) throw new Error("Event has ended");
		await insertAttendanceOnce(ctx, person._id, eventId);
		return { ok: true };
	},
});

/**
 * A non-visitor's event-invite confirm, redeemed atomically in one mutation
 * keyed by the invite TOKEN. Records attendance (deduped — see
 * `insertAttendanceOnce`) and leaves the consumed token so a repeat click is
 * refused. Unlike the visitor confirm this never touches the `people` row —
 * the person's tier/stage are owned by their own lifecycle, not by event
 * check-in.
 *
 * Redeem + write in one mutation closes the races the old read-then-consume
 * action left open, and a missing or former person is refused: a purged
 * person must not get attendance, and a kicked one must not get Wi-Fi back.
 */
export const confirmEventInviteByToken = internalMutation({
	args: { token: v.string() },
	handler: async (
		ctx,
		{ token }
	): Promise<{ status: InviteConfirmStatus }> => {
		const r = await redeemToken(ctx, token, "eventInvite");
		if (r.status === "invalid" || r.status === "already")
			return { status: "invalid" };
		if (r.status === "expired") return { status: "expired" };
		// Hard stop, no grace: the invite's event has ended or was deleted.
		const event = r.row.eventId ? await ctx.db.get(r.row.eventId) : null;
		if (!eventLive(event, Date.now())) return { status: "ended" };
		const person = await ctx.db.get(r.row.personId);
		if (person === null || person.tier === "former")
			return { status: "invalid" };
		await insertAttendanceOnce(ctx, person._id, event._id);
		return { status: "verified" };
	},
});

export const confirmEventInvite = action({
	args: { token: v.string() },
	handler: async (
		ctx,
		{ token }
	): Promise<{
		status: InviteConfirmStatus;
		wifi?: Wifi;
	}> => {
		const res = await ctx.runMutation(
			internal.eventCheckIn.confirmEventInviteByToken,
			{ token }
		);
		if (res.status === "verified")
			return { ...res, wifi: await ctx.runQuery(internal.wifi.read, {}) };
		return res;
	},
});
