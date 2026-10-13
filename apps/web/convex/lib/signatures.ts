import type { WithoutSystemFields } from "convex/server";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Insert a signature and add its variant to the person's `signedVariants`.
 * Every `signatures` insert goes through here, so the roster queries can read
 * the variants off the person instead of querying signatures per row.
 * A signature needs a `fileId` or a `sourceUrl`: `hasAgreement` on the roster
 * is "has signed a variant", which only matches "has a document to open" while
 * no signature lacks both.
 */
export async function insertSignature(
	ctx: MutationCtx,
	row: WithoutSystemFields<Doc<"signatures">>
): Promise<Id<"signatures">> {
	if (row.fileId === undefined && row.sourceUrl === undefined)
		throw new Error("A signature needs a fileId or a sourceUrl.");
	const id = await ctx.db.insert("signatures", row);
	const person = await ctx.db.get(row.personId);
	const signed = person?.signedVariants ?? [];
	if (person && !signed.includes(row.variant))
		await ctx.db.patch(person._id, {
			signedVariants: [...signed, row.variant],
		});
	return id;
}

/**
 * The distinct variants a person has signed, read from their signatures, or
 * `undefined` when there are none. The source of truth that `signedVariants`
 * is kept equal to.
 */
async function signedVariantsOf(
	ctx: QueryCtx,
	personId: Id<"people">
): Promise<Doc<"signatures">["variant"][] | undefined> {
	const signatures = await ctx.db
		.query("signatures")
		.withIndex("by_person", (q) => q.eq("personId", personId))
		.collect();
	const variants = [...new Set(signatures.map((s) => s.variant))];
	return variants.length > 0 ? variants : undefined;
}

/** Whether two variant sets hold the same variants, order aside. */
function sameVariants(
	a: readonly string[] | undefined,
	b: readonly string[] | undefined
): boolean {
	if (a === undefined || b === undefined) return a === b;
	return a.length === b.length && a.every((variant) => b.includes(variant));
}

/**
 * Bring the person's `signedVariants` back in line with their signatures,
 * patching only when it differs. Returns whether it differed (with `dryRun`,
 * nothing is written).
 */
export async function syncSignedVariants(
	ctx: MutationCtx,
	person: Doc<"people">,
	opts?: { dryRun?: boolean }
): Promise<boolean> {
	const want = await signedVariantsOf(ctx, person._id);
	if (sameVariants(want, person.signedVariants)) return false;
	if (!opts?.dryRun) await ctx.db.patch(person._id, { signedVariants: want });
	return true;
}
