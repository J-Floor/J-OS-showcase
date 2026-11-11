import { ConvexError, v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import { hasAttendance } from "./lib/attendance.ts";
import { keepsBreakGlassKey } from "./lib/derive.ts";
import { normalizeEmail, peopleByEmail } from "./lib/emailAddress.ts";
import type { PeopleError } from "./lib/errors/people.ts";
import { violations } from "./lib/invariants.ts";
import {
	documentsNaming,
	type Naming,
	replacePersonId,
} from "./lib/peopleRefs.ts";
import { personStateOf } from "./lib/personState.ts";
import { refuse, refuseLogged, unwrap, unwrapLogged } from "./lib/result.ts";
import { syncSignedVariants } from "./lib/signatures.ts";
import { withoutSystemFields } from "./people.ts";

const mergeArgs = {
	keepId: v.id("people"),
	dropId: v.id("people"),
	// A partial person; the write validates the merged row against the schema.
	patch: v.any(),
};

/** True for the rollback a dry run ends with (`DryRunRollback`), and nothing
 *  else. A `ConvexError`, so no message text in a patch can pass for it. */
export function isDryRunRollback(error: unknown): boolean {
	return (
		error instanceof ConvexError &&
		(error.data as { code?: unknown } | null)?.code === "DryRunRollback"
	);
}

type Preview = {
	drop: Doc<"people">;
	/** The kept row's email after the merge, always in canonical form. */
	email: string;
	/** False when the provider account the dropped row names would be
	 *  the kept person's after the merge, so revoking by the dropped
	 *  row would take the kept person's key. */
	revokeDropped: boolean;
	/** True when that shared account holds the dropped row's
	 *  break-glass key and the kept person is not entitled to one: the
	 *  kept person is revoked after the merge instead. */
	revokeKept: boolean;
};

async function isEmailHeldByOther(
	context: QueryCtx,
	email: string,
	keepId: Id<"people">,
	dropId: Id<"people">
): Promise<boolean> {
	const holders = await peopleByEmail(context, email).collect();
	// The dropped row's own address is the kept person's to take.
	return holders.some(
		(holder) => holder._id !== keepId && holder._id !== dropId
	);
}

async function signatureVariantsOf(
	context: QueryCtx,
	personIds: Id<"people">[]
): Promise<string[]> {
	const variants: string[] = [];
	for (const personId of personIds) {
		const signatures = await context.db
			.query("signatures")
			.withIndex("by_person", (range) => range.eq("personId", personId))
			.collect();
		variants.push(...signatures.map((signature) => signature.variant));
	}
	return variants;
}

function isSharingProviderAccount(
	drop: Doc<"people">,
	merged: Doc<"people">,
	email: string
): boolean {
	const dropUser = drop.door?.doorUserId;
	return (
		(dropUser !== undefined && dropUser === merged.door?.doorUserId) ||
		email === normalizeEmail(drop.email)
	);
}

/** The kept row as it will be after the merge, and what is wrong with it. */
async function preview(
	context: QueryCtx,
	keepId: Id<"people">,
	dropId: Id<"people">,
	patch: Partial<Doc<"people">>
): Promise<Result<Preview, PeopleError>> {
	if (keepId === dropId) return err({ type: "MergeSelf" });
	const keep = await context.db.get(keepId);
	const drop = await context.db.get(dropId);
	if (!keep || !drop) return err({ type: "MergePersonNotFound" });

	const now = Date.now();
	const merged = { ...keep, ...patch };
	// Normalized even when the patch leaves the email alone: a kept row stored
	// with capitals would otherwise stay unreachable by every lookup.
	const email = normalizeEmail(merged.email);
	if (await isEmailHeldByOther(context, email, keepId, dropId))
		return err({ type: "EmailInUse" });

	const variants = await signatureVariantsOf(context, [keepId, dropId]);
	const found = violations({ ...merged, email }, variants, now);
	if (found.length)
		return err({
			type: "MergeInvalid",
			violations: found
				.map((finding) => `${finding.code} (${finding.detail})`)
				.join(", "),
		});

	const isSharesAccount = isSharingProviderAccount(drop, merged, email);
	const isDropKeepsKey = keepsBreakGlassKey(drop, now);
	// The revoke skips a break-glass key, and nothing else would ever revoke
	// this one once the row is gone.
	if (!isSharesAccount && isDropKeepsKey)
		return err({ type: "MergeStrandsBreakGlassKey" });
	return ok({
		drop,
		email,
		revokeDropped: !isSharesAccount,
		revokeKept:
			isSharesAccount &&
			isDropKeepsKey &&
			!keepsBreakGlassKey(merged, now),
	});
}

function patchOf(raw: unknown): Result<Partial<Doc<"people">>, PeopleError> {
	return raw === null || typeof raw !== "object" || Array.isArray(raw)
		? err({ type: "MergePatchNotObject" })
		: ok(raw);
}

/**
 * Attendance is one row per person and event, and `personState` one row per
 * person. When the kept person already has the row the dropped one is moving
 * into, the moved one would count twice, so it is deleted instead.
 */
async function isKeptAlreadyHolding(
	context: MutationCtx,
	{ table, doc }: Naming,
	keepId: Id<"people">
): Promise<boolean> {
	if (table === "personState") {
		return (await personStateOf(context, keepId)) !== null;
	}
	if (table !== "eventAttendance") return false;
	const { eventId } = doc as unknown as Doc<"eventAttendance">;
	return hasAttendance(context.db, keepId, eventId);
}

/** The cheap preview to run before `run`: refuses what can be seen without
 *  writing. It does not validate the patch's shape; `run` dry-runs the whole
 *  write, which the schema validates, before it revokes anything. */
export const check = internalQuery({
	args: mergeArgs,
	handler: async (context, { keepId, dropId, patch }) => {
		const clean = patchOf(patch);
		if (clean.isErr()) return { ok: false, error: clean.error } as const;
		const result = await preview(context, keepId, dropId, clean.value);
		if (result.isErr()) return { ok: false, error: result.error } as const;
		const scan = await documentsNaming(context, dropId);
		if (scan.isErr()) return { ok: false, error: scan.error } as const;
		return {
			ok: true,
			keptEmail: result.value.email,
			revokeDropped: result.value.revokeDropped,
			revokeKept: result.value.revokeKept,
		} as const;
	},
});

/**
 * Fold `dropId` into `keepId`: patch the kept row, move every reference to the
 * dropped row (found from the schema, not a hand list), audit, delete.
 * Refuses before the audit and delete when the kept row would end up in a
 * violated state or the references cannot be walked; the refusal is thrown at
 * the edge, which rolls the whole mutation back. With `dryRun` it does every write and then throws the
 * rollback {@link isDryRunRollback} recognises, so the rollback proves the
 * writes would succeed.
 */
export const apply = internalMutation({
	args: {
		...mergeArgs,
		actorId: v.optional(v.id("people")),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (context, { keepId, dropId, patch, actorId, dryRun }) => {
		const clean = unwrap(patchOf(patch));
		const result = unwrapLogged(
			await preview(context, keepId, dropId, clean),
			"Merge"
		);

		await context.db.patch(keepId, { ...clean, email: result.email });
		// Read after the patch so the kept row is walked as patched.
		const namings = unwrapLogged(
			await documentsNaming(context, dropId),
			"Merge"
		);
		let moved = 0;
		for (const naming of namings) {
			const _id = naming.doc._id;
			if (_id === dropId) continue;
			const fields = withoutSystemFields(naming.doc);
			const { value, changed } = replacePersonId(fields, dropId, keepId);
			if (!changed) continue;
			if (await isKeptAlreadyHolding(context, naming, keepId))
				await context.db.delete(_id);
			else await context.db.replace(_id, value);
			moved += 1;
		}
		// Signature rows moved without going through insertSignature.
		const keep = await context.db.get(keepId);
		if (keep) await syncSignedVariants(context, keep);
		await context.db.insert("personEvents", {
			personId: keepId,
			at: Date.now(),
			actorId,
			kind: "merge",
			meta: { dropId, droppedEmail: result.drop.email },
		});
		await context.db.delete(dropId);
		if (dryRun) refuse({ type: "DryRunRollback" });
		return { moved };
	},
});

/**
 * The entry point: check, dry-run the whole merge (every write, rolled back),
 * revoke the dropped row's door access while the row still exists (the revoke
 * looks the person up by id), then apply for real. The revoke is skipped when
 * `check` finds the provider account belongs to the kept person. When that
 * account carried the dropped board member's break-glass key and the kept
 * person is not entitled to one, the kept person is revoked after the apply.
 * The dropped-row revoke also spares any provider account carrying the kept
 * person's email.
 * Any dry-run failure other than the rollback refuses the merge before
 * anything is revoked.
 * `patch` is a shallow top-level replace, so pass whole nested objects (e.g.
 * the full `board` with its existing `noteLog` entries and `score`).
 * Scheduled jobs that name the dropped id (a guest's window expiry) are not
 * moved: they find no person and fail without effect.
 * Run: bunx convex run merge:run '{"keepId":"…","dropId":"…","patch":{…},"actorId":"…"}' --prod
 */
export const run = internalAction({
	args: { ...mergeArgs, actorId: v.optional(v.id("people")) },
	handler: async (context, args): Promise<{ moved: number }> => {
		const verdict = await context.runQuery(internal.merge.check, {
			keepId: args.keepId,
			dropId: args.dropId,
			patch: args.patch as unknown,
		});
		if (!verdict.ok) refuseLogged(verdict.error, "Merge");
		// The dry run always ends in a rollback. Any other rejection is the
		// real refusal, and passes on untouched, ConvexError code included.
		await context
			.runMutation(internal.merge.apply, { ...args, dryRun: true })
			.catch((error: unknown) =>
				isDryRunRollback(error)
					? undefined
					: // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- passes the mutation's own ConvexError on unchanged
						Promise.reject(error)
			);
		async function revoke(personId: Id<"people">, spareEmail?: string) {
			await context.runAction(
				internal.doorRevoke.revokeUnlessBreakGlass,
				{
					personId,
					trigger: "lifecycle",
					detail: "MERGE",
					spareEmail,
				}
			);
		}
		if (verdict.revokeDropped) await revoke(args.dropId, verdict.keptEmail);
		const result = await context.runMutation(internal.merge.apply, args);
		if (verdict.revokeKept) await revoke(args.keepId);
		return result;
	},
});
