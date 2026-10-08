// The per-person door revoke.
//
// Nobody is GRANTED a personal door key any more: the app opens the doors for everyone
// the door opens for (`doorOpensFor`, see `doorActions.ts#unlockDoor`). What is left
// here is the revoke half — the only people who may still hold a personal key on
// the two J floor locks are board/admin whose door access is granted (the
// break-glass keys); for anyone else, `revokeUnlessBreakGlass` revokes what
// they still hold. That is what keeps a break-glass key from outliving its
// holder's board seat or door access.
//
// No "use node": the door provider is a pure fetch client and actions may fetch
// in the default Convex runtime.
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import {
	internalAction,
	internalQuery,
	type ActionCtx,
} from "./_generated/server";
import type { doorLogRecordRow } from "./doorLog.ts";
import { keepsBreakGlassKey } from "./lib/derive.ts";
import {
	injectedDoorProvider,
	lockNamesFromModel,
	matchesStrictly,
	type DoorModel,
} from "./lib/doorProvider.ts";
import { doorProvider, doorWritesEnabled } from "./lib/doorProviderEnv.ts";
import { normalizeEmail } from "./lib/emailAddress.ts";
import { displayName } from "./lib/names.ts";

/**
 * The per-person target the RECONCILE_DOOR effect acts on, discriminated so a
 * caller can tell "nothing to do because the row is gone" apart from an
 * actual target.
 */
export type DoorTarget =
	| { status: "not_found" }
	| {
			status: "target";
			email: string;
			name: string;
			/** The provider account-user id resolved for this person in the past,
			 *  when there is one — `managedAuthsOf` matches on the stored id OR
			 *  the email (ignoring case), since the provider-side email can go stale. */
			doorUserId?: string;
			/** Board/admin AND door access granted right now: the only people
			 *  whose personal key survives as a break-glass key (see
			 *  {@link keepsBreakGlassKey}). */
			keepsBreakGlass: boolean;
	  };

export const doorTargetFor = internalQuery({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }): Promise<DoorTarget> => {
		const person = await ctx.db.get(personId);
		if (!person) return { status: "not_found" };
		return {
			status: "target",
			email: person.email,
			name: displayName(person),
			doorUserId: person.door?.doorUserId,
			keepsBreakGlass: keepsBreakGlassKey(person, Date.now()),
		};
	},
});

/** Why a per-person revoke did nothing, for the run log. */
const WRITES_DISABLED =
	"Door writes are disabled on this deployment; the per-person door revoke did not touch the lock account.";

/**
 * Whether a revoke may run at all. The gate protects the REAL lock account,
 * which every deployment holding the token shares; an injected test provider
 * is not that account, so it is let through. Production never injects one.
 */
function revokeAllowed(): boolean {
	return injectedDoorProvider() !== undefined || doorWritesEnabled();
}

async function recordAuthLog(
	ctx: ActionCtx,
	rows: Infer<typeof doorLogRecordRow>[]
): Promise<void> {
	if (rows.length === 0) return;
	await ctx.runMutation(internal.doorLog.record, { rows });
}

/**
 * This person's own account-user authorizations on the doors this app manages
 * (the provider model carries no others — see `DoorProvider.readModel`).
 * Matched strictly — by the stored provider id or the email (ignoring case) — never by name:
 * a name match is a guess, and a guess is not good enough to delete a key on.
 * An authorization with no account user is not in the model, so it is never
 * revoked here.
 */
function managedAuthsOf(
	model: DoorModel,
	target: { email: string; doorUserId?: string },
	spareEmail?: string
): { lockId: string; authId: string }[] {
	return model.identities
		.filter(
			(i) =>
				matchesStrictly(i, target) &&
				(spareEmail === undefined ||
					normalizeEmail(i.email) !== normalizeEmail(spareEmail))
		)
		.flatMap((i) => i.authIds ?? []);
}

/** What `revokeUnlessBreakGlass` did (or didn't do) for one person. */
export type RevokeUnlessBreakGlassResult =
	/** This deployment is not opted in to door writes; nothing was touched. */
	| { outcome: "disabled" }
	| { outcome: "not_found" }
	/** Board/admin with door access granted: their personal key is the
	 *  break-glass fallback, so nothing is touched. */
	| { outcome: "kept"; email: string }
	/** Anyone else: `revoked` authorizations were deleted (0 when the person
	 *  held none on the J floor locks). */
	| { outcome: "revoked"; email: string; revoked: number };

/**
 * Revoke one person's personal door keys unless they keep a break-glass key — the
 * only way the app still touches a person's keys. Scheduled by the
 * RECONCILE_DOOR effect (lifecycle, including a board/admin demotion via
 * `SET_ROLE`) and by a board door override.
 *
 * Board/admin AND door access granted: a no-op — their key is the
 * break-glass fallback for an internet or lock-provider outage. Nobody is ever
 * granted a key; the app opens the door.
 * Anyone else (a member whose access is granted, a demoted board member, a
 * board member the board has shut out, anyone whose access ended): revokes
 * the person's account-user authorizations on the two J floor locks (see
 * {@link managedAuthsOf}, `DoorProvider.readModel`) in one call and writes one
 * Door-log row naming the locks cleared. Never the email-wide `revokeAccess`,
 * which deleted across every lock on the account.
 *
 * A provider failure is NOT swallowed: the action rejects, which shows as a failed
 * scheduled run in the dashboard. There is no nightly sweep behind it any more,
 * so a failed revoke is re-run by hand (README, door access section). The
 * transition that scheduled it is unaffected (`scheduler.runAfter` discards the
 * result either way).
 */
export const revokeUnlessBreakGlass = internalAction({
	args: {
		personId: v.id("people"),
		trigger: v.union(v.literal("lifecycle"), v.literal("override")),
		detail: v.optional(v.string()),
		// A merge spares the provider account that already belongs to the kept person.
		spareEmail: v.optional(v.string()),
	},
	handler: async (
		ctx,
		{ personId, trigger, detail, spareEmail }
	): Promise<RevokeUnlessBreakGlassResult> => {
		if (!revokeAllowed()) {
			// eslint-disable-next-line no-console -- the only trace of a revoke this deployment deliberately skipped
			console.warn("doorRevoke.revokeUnlessBreakGlass:", WRITES_DISABLED);
			return { outcome: "disabled" };
		}
		const target = await ctx.runQuery(internal.doorRevoke.doorTargetFor, {
			personId,
		});
		if (target.status === "not_found") return { outcome: "not_found" };
		if (target.keepsBreakGlass)
			return { outcome: "kept", email: target.email };

		// NOT write-gated here: `revokeUnlessBreakGlass` already checked
		// `revokeAllowed()` before reaching this (see {@link revokeAllowed}).
		const provider = doorProvider({ requireWrites: false });
		const model = await provider.readModel();
		const auths = managedAuthsOf(model, target, spareEmail);
		if (auths.length === 0)
			return { outcome: "revoked", email: target.email, revoked: 0 };

		await provider.revokeAuthIds(auths.map((a) => a.authId));
		await recordAuthLog(ctx, [
			{
				operation: "revoke",
				trigger,
				detail,
				email: target.email,
				name: target.name,
				personId,
				lockNames: lockNamesFromModel(model, [
					...new Set(auths.map((a) => a.lockId)),
				]),
				outcome: "ok",
			},
		]);
		return {
			outcome: "revoked",
			email: target.email,
			revoked: auths.length,
		};
	},
});
