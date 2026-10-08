import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { entitled } from "./derive.ts";
import { personByEmail } from "./emailAddress.ts";
import type { Tier } from "./lifecycleTypes.ts";

/**
 * SECURITY: the server-side gate; the client role check is only UX.
 *
 * A caller must hold one of `tiers` AND be currently entitled — window open,
 * stage `onboarding` or `active`. `former` and `prospect` never pass, which is
 * what closes the hole where a kicked-out member kept their sign-in because the
 * legacy `type` field still said "member".
 *
 * Returns the validated `people` row so callers need not re-fetch it.
 *
 * Deliberately `entitled`, not `access`: the board's door override governs the
 * lock, not the app. A suspended member can still sign in; they just cannot
 * open the door.
 */
export async function requireRole(
	ctx: QueryCtx,
	tiers: readonly Tier[]
): Promise<Doc<"people">> {
	const identity = await ctx.auth.getUserIdentity();
	const email = identity?.email;
	if (!email) throw new Error("Not authenticated");
	const person = await personByEmail(ctx, email);
	if (!person || !tiers.includes(person.tier)) {
		throw new Error("Forbidden");
	}
	if (!entitled(person, Date.now())) {
		throw new Error("Access expired or revoked");
	}
	return person;
}
