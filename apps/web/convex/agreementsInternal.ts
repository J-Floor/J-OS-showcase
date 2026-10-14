// apps/web/convex/agreementsInternal.ts
// Internal query and mutation for signAgreement — runs in the default Convex
// runtime (no "use node") so mutations/queries are allowed here.
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { agreementVariantFor, entitled } from "./lib/derive.ts";
import { personByEmail } from "./lib/emailAddress.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { insertSignature } from "./lib/signatures.ts";
import { markStepComplete } from "./onboarding.ts";

/**
 * Everything needed to generate and record a signed agreement, or null when the
 * caller is not in an onboarding stage or is not entitled right now.
 *
 * `alreadySigned` asks whether a NATIVE (in-app) signature exists FOR THE
 * CURRENT VARIANT, not whether any signature exists. Two reasons it is that
 * narrow:
 *  - A guest promoted to member holds a guest agreement; treating that as
 *    "already signed" would leave them permanently outstanding and
 *    un-activatable.
 *  - A LEGACY agreement imported from the old Notion DB carries only a Google
 *    Drive `sourceUrl` (no `fileId`). Those people still need to sign the
 *    current PDF in-app, so a legacy row must NOT block signing — `signAgreement`
 *    threw "Agreement already signed." for exactly this. `recordSignature`
 *    crushes the legacy row when the native signature lands.
 * A native signature always has a `fileId` (`recordSignature` requires one);
 * a legacy/imported row never does — so `fileId !== undefined` is what tells
 * a real completed in-app signature apart from a legacy link.
 */
export const signingContext = internalQuery({
	args: {},
	handler: async (
		context
	): Promise<{
		personId: Id<"people">;
		email: string;
		name: string;
		company: string | undefined;
		variant: "member" | "guest";
		alreadySigned: boolean;
	} | null> => {
		const identity = await context.auth.getUserIdentity();
		const email = identity?.email;
		if (!email) return null;

		const person = await personByEmail(context, email);
		if (person?.stage !== "onboarding") return null;
		const variant = agreementVariantFor(person.tier);
		if (variant === null || !entitled(person, Date.now())) return null;

		const signatures = await context.db
			.query("signatures")
			.withIndex("by_person", (range) => range.eq("personId", person._id))
			.collect();

		return {
			personId: person._id,
			email: person.email,
			name: displayName(person),
			company: person.venture?.name,
			variant,
			alreadySigned: signatures.some(
				(signature) =>
					signature.variant === variant &&
					signature.fileId !== undefined
			),
		};
	},
});

// ---------------------------------------------------------------------------
// Internal query — fetches the signature record needed for integrity
// verification. Returns null if no signed record exists or it has no fileId.
// ---------------------------------------------------------------------------
export const signatureForVerification = internalQuery({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		await requireRole(context, BOARD_LEVEL);
		const sig = await context.db
			.query("signatures")
			.withIndex("by_person", (range) => range.eq("personId", personId))
			.order("desc")
			.first();
		if (!sig?.fileId) return null;
		return {
			fileId: sig.fileId,
			signedPdfHash: sig.signedPdfHash,
			certFingerprint: sig.certFingerprint,
		};
	},
});

// ---------------------------------------------------------------------------
// Internal mutation — inserts the signatures row and marks the document step
// complete (using the shared helper exported from onboarding.ts).
// ---------------------------------------------------------------------------
export const recordSignature = internalMutation({
	args: {
		personId: v.id("people"),
		email: v.string(),
		variant: v.union(v.literal("member"), v.literal("guest")),
		signedName: v.string(),
		company: v.optional(v.string()),
		agreementVersion: v.string(),
		agreementHash: v.string(),
		signedAt: v.number(),
		fileId: v.id("_storage"),
		signedPdfHash: v.optional(v.string()),
		certFingerprint: v.optional(v.string()),
	},
	handler: async (context, args) => {
		// Crush any LEGACY agreement of the same variant — an imported Notion row
		// carrying only a Google Drive `sourceUrl` (no `fileId`). Signing in-app
		// replaces it with the freshly sealed PDF, so the person is not left with
		// a stale external link beside the real signature (and `alreadySigned`,
		// which now ignores legacy rows, would otherwise let a second one pile up
		// on every re-onboarding). A native signature (has `fileId`) is never
		// touched here — a genuine double-sign is already blocked upstream by
		// `signingContext.alreadySigned`.
		const prior = await context.db
			.query("signatures")
			.withIndex("by_person", (range) =>
				range.eq("personId", args.personId)
			)
			.collect();
		for (const signature of prior) {
			if (
				signature.variant === args.variant &&
				signature.fileId === undefined
			) {
				await context.db.delete(signature._id);
			}
		}
		await insertSignature(context, {
			personId: args.personId,
			email: args.email,
			variant: args.variant,
			signedName: args.signedName,
			company: args.company,
			agreementVersion: args.agreementVersion,
			agreementHash: args.agreementHash,
			signedAt: args.signedAt,
			fileId: args.fileId,
			signedPdfHash: args.signedPdfHash,
			certFingerprint: args.certFingerprint,
		});
		// Completing the document step is what asks the machine to re-evaluate
		// activation, now that compliance can be met.
		await markStepComplete(context, args.personId, "document");
	},
});

export const boardSignatureFiles = internalQuery({
	args: {},
	handler: async (context) => {
		const signatures = await context.db.query("boardSignatures").collect();
		return signatures.map((signature) => ({
			slug: signature.slug,
			fileId: signature.fileId,
		}));
	},
});

export const upsertBoardSignature = internalMutation({
	args: { slug: v.string(), fileId: v.id("_storage") },
	handler: async (context, { slug, fileId }) => {
		const prior = await context.db
			.query("boardSignatures")
			.withIndex("by_slug", (range) => range.eq("slug", slug))
			.first();
		if (prior) {
			await context.storage.delete(prior.fileId);
			await context.db.patch(prior._id, { fileId });
		} else {
			await context.db.insert("boardSignatures", { slug, fileId });
		}
		return null;
	},
});
