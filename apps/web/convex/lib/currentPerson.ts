import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { personByEmail } from "./emailAddress.ts";

/**
 * The `people` row for the currently-authenticated caller, resolved by
 * matching the auth identity's email against `by_email`. Returns `null` for
 * an unauthenticated caller or one with no linked person row. Shared by
 * `people.ts`, `onboarding.ts` and `visitors.ts` — used to be a byte-identical
 * copy in each.
 */
export async function personForCurrentUser(
	ctx: QueryCtx
): Promise<Doc<"people"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	const email = identity?.email;
	if (!email) return null;
	return personByEmail(ctx, email);
}
