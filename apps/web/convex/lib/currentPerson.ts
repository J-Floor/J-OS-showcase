import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** The person linked to the login `subject` (`people.authUserId`), or null. */
export async function personForLogin(
	context: QueryCtx,
	subject: string
): Promise<Doc<"people"> | null> {
	return context.db
		.query("people")
		.withIndex("by_authUserId", (range) => range.eq("authUserId", subject))
		.unique();
}

/**
 * The `people` row for the signed-in caller: the person linked to the login
 * they signed in with (`people.authUserId`, set at sign-in by
 * `lib/authRecords#linkLogin`). Null when signed out or not linked.
 */
export async function personForCurrentUser(
	context: QueryCtx
): Promise<Doc<"people"> | null> {
	const identity = await context.auth.getUserIdentity();
	return identity ? personForLogin(context, identity.subject) : null;
}
