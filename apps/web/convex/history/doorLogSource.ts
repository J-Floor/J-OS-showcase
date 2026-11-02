import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import type { DoorActionEntry } from "./types.ts";

/** How many of a person's newest `doorLog` rows the history reads. A daily
 *  member unlocks far more often than anything else happens to them, so this
 *  read has its own cap, below the events' one. Deliberate consequence: for a
 *  heavy door user, older history shows transitions and edits but no door
 *  actions — that is the cap, not a gap in their use of the door. */
export const DOOR_ACTION_LIMIT = 100;

type DoorActionRow = Doc<"doorLog"> & { operation: "unlock" | "lock" };

/**
 * Doors the person unlocked or locked from the app, newest first. They are
 * logged in `doorLog` (their only per-person record), not `personEvents`.
 * That table's key grants and revokes are left out: they are what the app did
 * to the person's keys, not what they did. They share the index, so they are
 * dropped after the read, and count toward the cap.
 */
export async function doorLogSource(
	context: QueryCtx,
	personId: Id<"people">
): Promise<DoorActionEntry[]> {
	const rows = await context.db
		.query("doorLog")
		.withIndex("by_personId_and_at", (range) =>
			range.eq("personId", personId)
		)
		.order("desc")
		.take(DOOR_ACTION_LIMIT);
	return rows
		.filter(
			(row): row is DoorActionRow =>
				row.operation === "unlock" || row.operation === "lock"
		)
		.map((row) => ({
			kind: "door_action",
			_id: row._id,
			at: row.at,
			action: row.operation,
			slot: row.slot,
			outcome: row.outcome,
			detail: row.detail,
			actorId: row.actorId,
		}));
}
