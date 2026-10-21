import type { WithoutSystemFields } from "convex/server";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { invariant } from "./result.ts";

/**
 * Insert a signature and add its variant to the person's `signedVariants`.
 * Every `signatures` insert goes through here, so the roster queries can read
 * the variants off the person instead of querying signatures per row.
 * A signature needs a `fileId` or a `sourceUrl`: `hasAgreement` on the roster
 * is "has signed a variant", which only matches "has a document to open" while
 * no signature lacks both.
 */
export async function insertSignature(
	context: MutationCtx,
	row: WithoutSystemFields<Doc<"signatures">>
): Promise<Id<"signatures">> {
	invariant(
		row.fileId !== undefined || row.sourceUrl !== undefined,
		"A signature needs a fileId or a sourceUrl."
	);
	const id = await context.db.insert("signatures", row);
	const person = await context.db.get(row.personId);
	const signed = person?.signedVariants ?? [];
	if (person && !signed.includes(row.variant))
		await context.db.patch(person._id, {
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
	context: QueryCtx,
	personId: Id<"people">
): Promise<Doc<"signatures">["variant"][] | undefined> {
	const signatures = await context.db
		.query("signatures")
		.withIndex("by_person", (range) => range.eq("personId", personId))
		.collect();
	const variants = [
		...new Set(signatures.map((signature) => signature.variant)),
	];
	return variants.length > 0 ? variants : undefined;
}

/** Whether two variant sets hold the same variants, order aside. */
function isSameVariantSet(
	left: readonly string[] | undefined,
	right: readonly string[] | undefined
): boolean {
	return left === undefined || right === undefined
		? left === right
		: left.length === right.length &&
				left.every((variant) => right.includes(variant));
}

/**
 * Bring the person's `signedVariants` back in line with their signatures,
 * patching only when it differs. Returns whether it differed (with `dryRun`,
 * nothing is written).
 */
export async function syncSignedVariants(
	context: MutationCtx,
	person: Doc<"people">,
	options?: { dryRun?: boolean }
): Promise<boolean> {
	const want = await signedVariantsOf(context, person._id);
	if (isSameVariantSet(want, person.signedVariants)) return false;
	if (!options?.dryRun)
		await context.db.patch(person._id, { signedVariants: want });
	return true;
}
