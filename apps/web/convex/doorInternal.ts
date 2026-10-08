// Internal functions behind the app's door buttons (`doorActions.unlockDoor` /
// `doorActions.lockDoor`) and its door-position read (`doorActions.doorPosition`). Runs in the default Convex runtime (no "use node"), so it
// can read the database the "use node" actions in `doorActions.ts` cannot.
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { doorOpensFor } from "./lib/derive.ts";
import type { DoorPosition } from "./lib/doorProvider.ts";
import { personByEmail } from "./lib/emailAddress.ts";
import { displayName } from "./lib/names.ts";
import { doorAction, doorPosition, lockSlot } from "./schema.ts";

type DoorPerson = { email: string; name: string; personId: Id<"people"> };

/**
 * The signed-in caller's `people` row, or null unless they are authenticated,
 * have a matching row, AND the door opens for them
 * ({@link doorOpensFor}) — the whole gate on the app's door buttons.
 */
async function currentDoorPerson(ctx: QueryCtx): Promise<Doc<"people"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	const email = identity?.email;
	if (!email) return null;

	const person = await personByEmail(ctx, email);
	if (!person) return null;
	if (!doorOpensFor(person, Date.now())) return null;

	return person;
}

type DoorActionWho = DoorPerson & {
	/** Until when a repeat is blocked: when this person last successfully did
	 *  THIS action (`args.action`) on THIS door (`args.lock`) from the app, plus
	 *  that row's `durationMs` (a row without one blocks nothing), for the
	 *  per-door, per-action debounce. Read from the NEWEST ok row for the door —
	 *  an exact index lookup on `personId + slot + outcome "ok"`, `slot` being
	 *  set ONLY on app unlock/lock rows (see `schema.ts#doorLogRow`), so a
	 *  grant/revoke row never carries a slot and can never match. That newest
	 *  row counts only if its `operation` equals the requested action: locking
	 *  right after an unlock (or the reverse) is a new intent, not a repeat. A
	 *  successful action on the OTHER door does not count either, so tapping
	 *  downstairs then upstairs within the window opens both. Undefined
	 *  otherwise. */
	lastSameActionUntil: number | undefined;
};

/**
 * Auth context for the app's door buttons (unlock and lock): everyone the door
 * is open for — `doorOpensFor(person, now)`, guests included — and
 * nobody else, whatever their tier; the board's force_off wins here as
 * everywhere. One of TWO gates: the client's UnlockCard shows the card only
 * while `doorOpensFor(person, now)` — the same check — which only spares
 * everyone else a button this would refuse. `lock` + `action` scope the
 * debounce to that door and that action: see
 * {@link DoorActionWho.lastSameActionUntil}.
 */
export const doorActionContext = internalQuery({
	args: {
		lock: lockSlot,
		action: doorAction,
	},
	handler: async (ctx, args): Promise<DoorActionWho | null> => {
		const person = await currentDoorPerson(ctx);
		if (!person) return null;

		const last = await ctx.db
			.query("doorLog")
			.withIndex("by_personId_and_slot_and_outcome_and_at", (q) =>
				q
					.eq("personId", person._id)
					.eq("slot", args.lock)
					.eq("outcome", "ok")
			)
			.order("desc")
			.first();

		return {
			email: person.email,
			name: displayName(person),
			personId: person._id,
			lastSameActionUntil:
				last?.operation === args.action
					? last.at + (last.durationMs ?? 0)
					: undefined,
		};
	},
});

/** Whether the caller may read door positions: the door opens for them. */
export const canSeeDoorPosition = internalQuery({
	args: {},
	handler: async (ctx): Promise<boolean> =>
		(await currentDoorPerson(ctx)) !== null,
});

/** The cached bolt position for a door, or null when there is none or it was
 *  checked before `freshSince`. */
export const readDoorPositionCache = internalQuery({
	args: { slot: lockSlot, freshSince: v.number() },
	handler: async (ctx, args): Promise<DoorPosition | null> => {
		const row = await ctx.db
			.query("doorPositionCache")
			.withIndex("by_slot", (q) => q.eq("slot", args.slot))
			.first();
		return row && row.checkedAt >= args.freshSince ? row.position : null;
	},
});

/** Upserts the cached bolt position for a door: one row per slot. */
export const writeDoorPositionCache = internalMutation({
	args: { slot: lockSlot, position: doorPosition, checkedAt: v.number() },
	handler: async (ctx, args): Promise<null> => {
		const row = await ctx.db
			.query("doorPositionCache")
			.withIndex("by_slot", (q) => q.eq("slot", args.slot))
			.unique();
		if (row)
			await ctx.db.patch(row._id, {
				position: args.position,
				checkedAt: args.checkedAt,
			});
		else await ctx.db.insert("doorPositionCache", args);
		return null;
	},
});

/** Drops a door's cached bolt position, so the next read asks the provider. */
export const clearDoorPositionCache = internalMutation({
	args: { slot: lockSlot },
	handler: async (ctx, args): Promise<null> => {
		const row = await ctx.db
			.query("doorPositionCache")
			.withIndex("by_slot", (q) => q.eq("slot", args.slot))
			.unique();
		if (row) await ctx.db.delete(row._id);
		return null;
	},
});
