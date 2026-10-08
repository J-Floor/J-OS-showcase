import { ConvexError, v } from "convex/values";

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
import {
	EMAIL_IN_USE,
	normalizeEmail,
	peopleByEmail,
} from "./lib/emailAddress.ts";
import { violations } from "./lib/invariants.ts";
import {
	documentsNaming,
	type Naming,
	replacePersonId,
} from "./lib/peopleRefs.ts";

const mergeArgs = {
	keepId: v.id("people"),
	dropId: v.id("people"),
	// A partial person; the write validates the merged row against the schema.
	patch: v.any(),
};

/** What a dry run throws once every write is done, so Convex rolls them back.
 *  A `ConvexError`, so no message text in a patch can pass for it. */
const DRY_RUN_ROLLBACK = { kind: "mergeDryRun" } as const;

/** True for the rollback a dry run ends with, and nothing else. */
export function isDryRunRollback(error: unknown): boolean {
	return (
		error instanceof ConvexError &&
		(error.data as { kind?: unknown } | null)?.kind ===
			DRY_RUN_ROLLBACK.kind
	);
}

type Preview =
	| { problem: string }
	| {
			problem: null;
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

/** The kept row as it will be after the merge, and what is wrong with it. */
async function preview(
	ctx: QueryCtx,
	keepId: Id<"people">,
	dropId: Id<"people">,
	patch: Partial<Doc<"people">>
): Promise<Preview> {
	if (keepId === dropId)
		return { problem: "Cannot merge a person into itself." };
	const keep = await ctx.db.get(keepId);
	const drop = await ctx.db.get(dropId);
	if (!keep || !drop) return { problem: "Person not found." };

	const now = Date.now();
	const merged = { ...keep, ...patch };
	// Normalized even when the patch leaves the email alone: a kept row stored
	// with capitals would otherwise stay unreachable by every lookup.
	const email = normalizeEmail(merged.email);
	const holders = await peopleByEmail(ctx, email).collect();
	// The dropped row's own address is the kept person's to take.
	if (holders.some((p) => p._id !== keepId && p._id !== dropId))
		return { problem: EMAIL_IN_USE };

	const variants = [
		...(await ctx.db
			.query("signatures")
			.withIndex("by_person", (q) => q.eq("personId", keepId))
			.collect()),
		...(await ctx.db
			.query("signatures")
			.withIndex("by_person", (q) => q.eq("personId", dropId))
			.collect()),
	].map((s) => s.variant);
	const found = violations({ ...merged, email }, variants, now);
	if (found.length)
		return {
			problem: found.map((f) => `${f.code} (${f.detail})`).join(", "),
		};

	const dropUser = drop.door?.doorUserId;
	const sharesAccount =
		(dropUser !== undefined && dropUser === merged.door?.doorUserId) ||
		email === normalizeEmail(drop.email);
	const dropKeepsKey = keepsBreakGlassKey(drop, now);
	// The revoke skips a break-glass key, and nothing else would ever revoke
	// this one once the row is gone.
	if (!sharesAccount && dropKeepsKey)
		return {
			problem:
				"The dropped person is board or admin with door access granted, so their personal door key is a break-glass key and would never be revoked. Shut off their door access or demote them first.",
		};
	return {
		problem: null,
		drop,
		email,
		revokeDropped: !sharesAccount,
		revokeKept:
			sharesAccount && dropKeepsKey && !keepsBreakGlassKey(merged, now),
	};
}

function patchOf(raw: unknown): Partial<Doc<"people">> | null {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw))
		return null;
	return raw;
}

const NOT_AN_OBJECT = "The patch must be an object.";

/**
 * Attendance is one row per person and event. When the kept person already
 * has the row the dropped one is moving into, the moved one would count
 * twice, so it is deleted instead.
 */
async function keptAlreadyHas(
	ctx: MutationCtx,
	{ table, doc }: Naming,
	keepId: Id<"people">
): Promise<boolean> {
	if (table !== "eventAttendance") return false;
	const { eventId } = doc as unknown as Doc<"eventAttendance">;
	return hasAttendance(ctx.db, keepId, eventId);
}

/** The cheap preview to run before `run`: refuses what can be seen without
 *  writing. It does not validate the patch's shape; `run` dry-runs the whole
 *  write, which the schema validates, before it revokes anything. */
export const check = internalQuery({
	args: mergeArgs,
	handler: async (ctx, { keepId, dropId, patch }) => {
		const clean = patchOf(patch);
		if (!clean) return { ok: false, reason: NOT_AN_OBJECT } as const;
		const result = await preview(ctx, keepId, dropId, clean);
		if (result.problem !== null)
			return { ok: false, reason: result.problem } as const;
		const scan = await documentsNaming(ctx, dropId);
		if ("problem" in scan)
			return { ok: false, reason: scan.problem } as const;
		return {
			ok: true,
			keptEmail: result.email,
			revokeDropped: result.revokeDropped,
			revokeKept: result.revokeKept,
		} as const;
	},
});

/**
 * Fold `dropId` into `keepId`: patch the kept row, move every reference to the
 * dropped row (found from the schema, not a hand list), audit, delete.
 * Throws before the audit and delete when the kept row would end up in a
 * violated state or the references cannot be walked; a throw rolls the whole
 * mutation back. With `dryRun` it does every write and then throws the
 * rollback {@link isDryRunRollback} recognises, so the rollback proves the
 * writes would succeed.
 */
export const apply = internalMutation({
	args: {
		...mergeArgs,
		actorId: v.optional(v.id("people")),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, { keepId, dropId, patch, actorId, dryRun }) => {
		const clean = patchOf(patch);
		if (!clean) throw new Error(`Merge refused: ${NOT_AN_OBJECT}`);
		const result = await preview(ctx, keepId, dropId, clean);
		if (result.problem !== null)
			throw new Error(`Merge refused: ${result.problem}`);

		await ctx.db.patch(keepId, { ...clean, email: result.email });
		// Read after the patch so the kept row is walked as patched.
		const scan = await documentsNaming(ctx, dropId);
		if ("problem" in scan)
			throw new Error(`Merge refused: ${scan.problem}`);
		let moved = 0;
		for (const naming of scan.docs) {
			const { _id, _creationTime, ...fields } = naming.doc;
			if (_id === dropId) continue;
			void _creationTime;
			const { value, changed } = replacePersonId(fields, dropId, keepId);
			if (!changed) continue;
			if (await keptAlreadyHas(ctx, naming, keepId))
				await ctx.db.delete(_id);
			else await ctx.db.replace(_id, value);
			moved += 1;
		}
		await ctx.db.insert("personEvents", {
			personId: keepId,
			at: Date.now(),
			actorId,
			kind: "merge",
			meta: { dropId, droppedEmail: result.drop.email },
		});
		await ctx.db.delete(dropId);
		if (dryRun) throw new ConvexError(DRY_RUN_ROLLBACK);
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
	handler: async (ctx, args): Promise<{ moved: number }> => {
		const verdict = await ctx.runQuery(internal.merge.check, {
			keepId: args.keepId,
			dropId: args.dropId,
			patch: args.patch as unknown,
		});
		if (!verdict.ok) throw new Error(`Merge refused: ${verdict.reason}`);
		try {
			await ctx.runMutation(internal.merge.apply, {
				...args,
				dryRun: true,
			});
		} catch (error) {
			if (!isDryRunRollback(error)) throw error;
		}
		async function revoke(personId: Id<"people">, spareEmail?: string) {
			await ctx.runAction(internal.doorRevoke.revokeUnlessBreakGlass, {
				personId,
				trigger: "lifecycle",
				detail: "MERGE",
				spareEmail,
			});
		}
		if (verdict.revokeDropped) await revoke(args.dropId, verdict.keptEmail);
		const result = await ctx.runMutation(internal.merge.apply, args);
		if (verdict.revokeKept) await revoke(args.keepId);
		return result;
	},
});
