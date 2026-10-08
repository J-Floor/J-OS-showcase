import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";

/** How many of a person's newest `doorLog` rows the timeline reads. A daily
 *  member unlocks far more often than anything else happens to them, so this
 *  read is capped where `personEvents` is not. Deliberate consequence: for a
 *  heavy door user, older history shows transitions and edits but no door
 *  actions — that is the cap, not a gap in their use of the door. */
const DOOR_ACTION_LIMIT = 100;

/**
 * A person's audit trail, newest first, with actor names resolved. Board-only:
 * it records suspensions, kicks and internal reasons, and is never shown to the
 * person themselves. Backfilled rows carry no actor and render without a name
 * rather than inventing one.
 *
 * Doors the person unlocked or locked from the app are logged in `doorLog`
 * (their only per-person record), not `personEvents`; they are merged in here
 * as `kind: "door_action"` rows. That table's key grants and revokes are left
 * out: they are what the app did to the person's keys, not what they did.
 */
export const listForPerson = query({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) => {
		await requireRole(ctx, BOARD_LEVEL);
		const events = await ctx.db
			.query("personEvents")
			.withIndex("by_person", (q) => q.eq("personId", personId))
			.collect();
		// Grants and revokes share this index; they are dropped here, after
		// the read, not indexed out (so they count toward the cap).
		const authLog = await ctx.db
			.query("doorLog")
			.withIndex("by_personId_and_at", (q) => q.eq("personId", personId))
			.order("desc")
			.take(DOOR_ACTION_LIMIT);
		const doorActions = authLog.filter(
			(row): row is typeof row & { operation: "unlock" | "lock" } =>
				row.operation === "unlock" || row.operation === "lock"
		);
		const rows = [
			...events,
			...doorActions.map((row) => ({
				_id: row._id,
				at: row.at,
				kind: "door_action" as const,
				action: row.operation,
				slot: row.slot,
				outcome: row.outcome,
				detail: row.detail,
				actorId: row.actorId,
			})),
		];
		const names = new Map<string, string>();
		return Promise.all(
			rows
				.sort((a, b) => b.at - a.at)
				.map(async (row) => {
					if (row.actorId === undefined)
						return { ...row, actorName: undefined };
					const cached = names.get(row.actorId);
					if (cached !== undefined)
						return { ...row, actorName: cached };
					const actor = await ctx.db.get(row.actorId);
					if (!actor) return { ...row, actorName: undefined };
					const actorName = displayName(actor);
					names.set(row.actorId, actorName);
					return { ...row, actorName };
				})
		);
	},
});
