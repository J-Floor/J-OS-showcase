import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import type { DoorOverride } from "./lib/derive.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { currentActorId } from "./lifecycle.ts";
import { doorOverride } from "./schema.ts";

/**
 * Board control of the door, independent of the lifecycle: `force_off` closes
 * it for someone otherwise entitled, `force_on` opens it for someone who is not.
 * The override survives promotions and window changes — clearing it is its own
 * board act, and every change is logged with who and why.
 *
 * This is not a machine event because it changes no tier and no stage. It
 * writes `door`, appends a `door` audit row, and asks the reconciler to make
 * the lock agree.
 */
/**
 * Write an override, log it, and ask the lock to agree.
 *
 * Shared so that setting the door as part of another decision — approving
 * someone as a guest with access withheld — leaves exactly the same trail as
 * setting it from the drawer. Two code paths writing `door` two different ways
 * is how an audit log starts lying.
 *
 * Caller must have checked authorisation; this does not.
 */
export async function applyDoorOverride(
	ctx: MutationCtx,
	personId: Id<"people">,
	override: DoorOverride,
	reason?: string
): Promise<void> {
	const person = await ctx.db.get(personId);
	if (!person) throw new Error("Person not found");
	const actorId = await currentActorId(ctx);
	const now = Date.now();

	// Keep the stored provider account id: it is how `revokeUnlessBreakGlass` finds
	// a break-glass key whose provider-side email no longer matches.
	await ctx.db.patch(personId, {
		door: {
			override,
			reason,
			byId: actorId,
			at: now,
			doorUserId: person.door?.doorUserId,
		},
	});
	await ctx.db.insert("personEvents", {
		personId,
		at: now,
		actorId,
		kind: "door",
		before: person.door?.override ?? "none",
		after: override,
		meta: reason,
	});
	await ctx.scheduler.runAfter(
		0,
		internal.doorRevoke.revokeUnlessBreakGlass,
		{
			personId,
			trigger: "override",
			detail: reason,
		}
	);
}

export const setOverride = mutation({
	args: {
		personId: v.id("people"),
		override: doorOverride,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, { personId, override, reason }) => {
		await requireRole(ctx, BOARD_LEVEL);
		await applyDoorOverride(ctx, personId, override, reason);
		return null;
	},
});
