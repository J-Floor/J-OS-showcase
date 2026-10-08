"use node";
// apps/web/convex/agreements/seal.ts
// Self-signed PAdES seal for signed agreements. Runs in the Convex Node runtime.
// The "use node" directive is required here (not just on the importing
// agreements.ts) because Convex bundles every convex/ file for the edge runtime
// unless the file itself opts into Node — node:crypto/@signpdf need Node.
//
// Sealing is APPEND-ONLY: @signpdf/placeholder-plain appends the signature
// placeholder as an incremental update and signpdf.sign fills it in place, so
// the upstream pdf-lib bytes (incl. Typst font subsets) are never re-serialized.
// This must be the FINAL write — nothing may rewrite the PDF afterward.
import { createHash } from "node:crypto";

import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { P12Signer } from "@signpdf/signer-p12";
// Use the named `SignPdf` class, NOT the default-instance export: @signpdf/signpdf
// is CJS and its default export survives a bare `require` but not Convex's esbuild
// bundling (it resolves `import signpdf from …` to the module namespace, so
// `signpdf.sign` becomes `module.exports.sign` === undefined → "sign is not a
// function" at runtime in prod, while passing under vitest's interop).
import { SignPdf } from "@signpdf/signpdf";
import forge from "node-forge";

/**
 * Compute the SHA-256 fingerprint (lowercase hex, no colons) of the leaf
 * certificate inside a PKCS#12 buffer. The fingerprint is derived from the
 * DER-encoded certificate, which makes it verifiable with standard tooling
 * (e.g. `openssl x509 -fingerprint -sha256`).
 */
export function certFingerprintFromP12(
	p12der: Buffer,
	passphrase: string
): string {
	const asn1 = forge.asn1.fromDer(
		forge.util.createBuffer(p12der.toString("binary"))
	);
	const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase);
	const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
	const cert = bags[forge.pki.oids.certBag]?.[0]?.cert;
	if (!cert) throw new Error("No certificate found in AGREEMENT_SIGNING_P12");
	const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
	return createHash("sha256")
		.update(Buffer.from(der, "binary"))
		.digest("hex");
}

/** Append a PAdES seal using the given PKCS#12 material. */
export async function sealWith(
	pdfBytes: Uint8Array,
	p12: Buffer,
	passphrase: string
): Promise<Uint8Array> {
	// plainAddPlaceholder uses the default signature reservation (~8 KB),
	// sufficient for a single self-signed 2048-bit cert. A larger cert or chain
	// would require passing an explicit `signatureLength` option.
	const withPlaceholder = plainAddPlaceholder({
		pdfBuffer: Buffer.from(pdfBytes),
		reason: "J floor membership agreement",
		contactInfo: "board@jfloor",
		name: "J floor Board",
		location: "Lausanne, CH",
	});
	const signer = new P12Signer(p12, { passphrase });
	const signed = await new SignPdf().sign(withPlaceholder, signer);
	return new Uint8Array(signed.buffer, signed.byteOffset, signed.byteLength);
}

/** Seal using key material from Convex env vars. */
export async function sealPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
	const b64 = process.env.AGREEMENT_SIGNING_P12;
	const pass = process.env.AGREEMENT_SIGNING_P12_PASS;
	if (!b64 || !pass) {
		throw new Error(
			"Agreement signing key not configured (set AGREEMENT_SIGNING_P12 and AGREEMENT_SIGNING_P12_PASS)"
		);
	}
	return sealWith(pdfBytes, Buffer.from(b64, "base64"), pass);
}

/**
 * Derive the fingerprint of the configured signing cert from the P12 itself,
 * so the audit anchor always matches the cert that seals. Reads
 * AGREEMENT_SIGNING_P12 + AGREEMENT_SIGNING_P12_PASS from env vars.
 */
export function signingCertFingerprint(): string {
	const b64 = process.env.AGREEMENT_SIGNING_P12;
	const pass = process.env.AGREEMENT_SIGNING_P12_PASS;
	if (!b64 || !pass) {
		throw new Error(
			"Agreement signing key not configured (set AGREEMENT_SIGNING_P12 and AGREEMENT_SIGNING_P12_PASS)"
		);
	}
	return certFingerprintFromP12(Buffer.from(b64, "base64"), pass);
}

/** Lowercase hex sha256 of the given bytes. */
export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}
