// apps/web/convex/agreements.ts
"use node";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import {
	TEMPLATES,
	AGREEMENT_VERSION,
} from "./agreements/generated/templates.ts";
import { drawSignedPdf, validatePngDataUrl } from "./agreements/pdf.ts";
import {
	sealPdf,
	sha256Hex,
	signingCertFingerprint,
} from "./agreements/seal.ts";
import { formatEmailDate } from "./emails/format.ts";
import { signedAgreement } from "./emails/generated/signedAgreement.ts";
import { emailUrls } from "./emails/urls.ts";
import { boardSignatories } from "./lib/boardSignatories.ts";
import { sendEmail } from "./lib/email.ts";

/**
 * Operator CLI: upload one board member's handwriting PNG. The PNG lives in
 * file storage, never in the repository or the static host:
 *   bunx convex run agreements:setBoardSignature '{"slug":"<slug>","dataUrl":"data:image/png;base64,…"}' --prod
 */
export const setBoardSignature = internalAction({
	args: { slug: v.string(), dataUrl: v.string() },
	handler: async (ctx, { slug, dataUrl }): Promise<null> => {
		if (!boardSignatories().some((b) => b.signatureSlug === slug))
			throw new Error(`Unknown signatory slug: ${slug}`);
		const png = validatePngDataUrl(dataUrl);
		const fileId = await ctx.storage.store(
			new Blob([png as unknown as ArrayBuffer], { type: "image/png" })
		);
		await ctx.runMutation(
			internal.agreementsInternal.upsertBoardSignature,
			{ slug, fileId }
		);
		return null;
	},
});

// ---------------------------------------------------------------------------
// Public action — the integration keystone called by the onboarding UI.
// Runs in Node.js so pdf-lib loads reliably and Buffer is available for
// large-array base64 encoding.
// ---------------------------------------------------------------------------
export const signAgreement = action({
	args: { signaturePng: v.string() },
	handler: async (ctx, { signaturePng }): Promise<null> => {
		const ctxData = await ctx.runQuery(
			internal.agreementsInternal.signingContext,
			{}
		);
		if (!ctxData) throw new Error("No onboarding in progress.");
		if (ctxData.alreadySigned) {
			throw new Error("Agreement already signed.");
		}
		const { personId, email, name, company, variant } = ctxData;

		const png = validatePngDataUrl(signaturePng);

		// Decode the template from base64 (stored in templates.ts as bytesBase64).
		// Buffer.from avoids the stack-overflow risk of spreading a large typed
		// array into String.fromCharCode before btoa.
		const templateBuf = Buffer.from(
			TEMPLATES[variant].bytesBase64,
			"base64"
		);
		const template = new Uint8Array(
			templateBuf.buffer,
			templateBuf.byteOffset,
			templateBuf.byteLength
		);

		const files = await ctx.runQuery(
			internal.agreementsInternal.boardSignatureFiles,
			{}
		);
		const board = await Promise.all(
			boardSignatories().map(async (b) => {
				const file = files.find((f) => f.slug === b.signatureSlug);
				const blob = file ? await ctx.storage.get(file.fileId) : null;
				return {
					name: b.name,
					role: b.role,
					signaturePng: blob
						? new Uint8Array(await blob.arrayBuffer())
						: undefined,
				};
			})
		);

		const now = Date.now();
		const drawn = await drawSignedPdf(template, {
			variant,
			name,
			company: company ?? "",
			email,
			date: formatEmailDate(now),
			signaturePng: png,
			board,
		});

		// FINAL write: append the self-signed PAdES seal. Nothing may
		// re-serialize the PDF after this point.
		const pdf = await sealPdf(drawn);

		const fileId = await ctx.storage.store(
			new Blob([pdf as unknown as ArrayBuffer], {
				type: "application/pdf",
			})
		);

		await ctx.runMutation(internal.agreementsInternal.recordSignature, {
			personId,
			email,
			variant,
			signedName: name,
			company,
			agreementVersion: AGREEMENT_VERSION[variant],
			agreementHash: TEMPLATES[variant].sha256,
			signedAt: now,
			fileId,
			signedPdfHash: sha256Hex(pdf),
			certFingerprint: signingCertFingerprint(),
		});

		// Encode the signed PDF as base64 for the email attachment. Buffer handles
		// ~60 KB arrays without the stack-overflow risk of spreading into
		// String.fromCharCode.
		const base64 = Buffer.from(pdf).toString("base64");
		const { html, text } = signedAgreement({
			name,
			logoUrl: emailUrls().logoUrl,
		});
		await sendEmail({
			to: email,
			subject: "Your signed J floor agreement",
			html,
			text,
			attachments: [
				{ filename: "J floor agreement.pdf", content: base64 },
			],
			devLog: `[signed-agreement] ${email}`,
		});
		return null;
	},
});

// ---------------------------------------------------------------------------
// Board-facing integrity check — recomputes the sha256 of the stored signed
// PDF and compares it to the recorded hash, surfacing the cert fingerprint.
//
// NOTE: this checks STORAGE-vs-DB integrity only (recomputed sha256 ==
// recorded hash). It does NOT verify the cryptographic PAdES seal itself.
// Full tamper-evidence relies on the embedded signature, which is verifiable
// in Adobe Acrobat or another PDF signature validator.
// ---------------------------------------------------------------------------
export const verifyAgreement = action({
	args: { personId: v.id("people") },
	handler: async (
		ctx,
		{ personId }
	): Promise<{
		ok: boolean;
		recordedHash?: string;
		actualHash?: string;
		certFingerprint?: string;
	}> => {
		const rec = await ctx.runQuery(
			internal.agreementsInternal.signatureForVerification,
			{ personId }
		);
		if (!rec?.signedPdfHash) return { ok: false };
		const blob = await ctx.storage.get(rec.fileId);
		if (!blob) return { ok: false, recordedHash: rec.signedPdfHash };
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const actualHash = sha256Hex(bytes);
		return {
			ok: actualHash === rec.signedPdfHash,
			recordedHash: rec.signedPdfHash,
			actualHash,
			certFingerprint: rec.certFingerprint,
		};
	},
});

// ---------------------------------------------------------------------------
// Unsigned preview — stamps the signer's details + today's date onto the blank
// template (no signature) so the onboarding UI can show/download a filled copy
// before signing. Generated on the fly, never stored. Returns null when the
// current user isn't a member/guest in onboarding.
// ---------------------------------------------------------------------------
export const previewAgreement = action({
	args: {},
	handler: async (ctx): Promise<string | null> => {
		const ctxData = await ctx.runQuery(
			internal.agreementsInternal.signingContext,
			{}
		);
		if (!ctxData) return null;
		const { email, name, company, variant } = ctxData;

		const templateBuf = Buffer.from(
			TEMPLATES[variant].bytesBase64,
			"base64"
		);
		const template = new Uint8Array(
			templateBuf.buffer,
			templateBuf.byteOffset,
			templateBuf.byteLength
		);

		// Preview fills only the applicant's own fields + date — the board
		// countersignature block stays blank (it's stamped at sign time).
		const pdf = await drawSignedPdf(template, {
			variant,
			name,
			company: company ?? "",
			email,
			date: formatEmailDate(Date.now()),
			board: [],
		});
		return Buffer.from(pdf).toString("base64");
	},
});
