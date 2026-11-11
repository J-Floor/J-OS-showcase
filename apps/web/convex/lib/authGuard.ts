import { type Result, err, ok } from "neverthrow";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { personForLogin } from "./currentPerson.ts";
import { entitled } from "./derive.ts";
import type { AuthError } from "./errors/auth.ts";
import type { Tier } from "./lifecycleTypes.ts";
import { unwrap } from "./result.ts";
import { CORE_AND_BOARD } from "./roles.ts";
import {
	NAME_MAX,
	TEXT_MAX,
	checkLength,
	withNullsCleared,
} from "./validate.ts";

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
	context: QueryCtx,
	tiers: readonly Tier[]
): Promise<Result<Doc<"people">, AuthError>> {
	const identity = await context.auth.getUserIdentity();
	if (!identity) return err({ type: "NotAuthenticated" });
	const person = await personForLogin(context, identity.subject);
	if (!person || !tiers.includes(person.tier)) {
		return err({ type: "Forbidden" });
	}
	return entitled(person, Date.now())
		? ok(person)
		: err({ type: "AccessExpired" });
}

/** The start of a core-or-board edit: the caller's person row, the name and
 *  description length checks, and the patch with nulls cleared. */
export async function authorizeEdit<Name extends "title" | "name">(
	context: MutationCtx,
	patch: { description?: string } & Partial<Record<Name, string>>,
	nameField: Name
): Promise<{ person: Doc<"people">; clean: Record<string, unknown> }> {
	const person = unwrap(await requireRole(context, CORE_AND_BOARD));
	unwrap(checkLength(patch[nameField], NAME_MAX));
	unwrap(checkLength(patch.description, TEXT_MAX));
	return { person, clean: withNullsCleared(patch) };
}
