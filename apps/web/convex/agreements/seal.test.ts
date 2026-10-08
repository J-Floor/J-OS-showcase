// @vitest-environment node
// apps/web/convex/agreements/seal.test.ts
import forge from "node-forge";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { TEMPLATES } from "./generated/templates.ts";
import { drawSignedPdf, validatePngDataUrl } from "./pdf.ts";
import { certFingerprintFromP12, sealWith, sha256Hex } from "./seal.ts";

const PASS = "test-pass";

// A 1x1 transparent PNG as a data URL (reused from pdf.test.ts).
const PNG_1PX =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** A small, valid, classic-xref PDF (matches drawSignedPdf's save options). */
async function makePdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([595, 842]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	page.drawText("J floor", { x: 70, y: 700, size: 12, font });
	return doc.save({ useObjectStreams: false });
}

/** Generate a throwaway self-signed PKCS#12 for the test. */
function makeTestP12(passphrase: string): Buffer {
	const keys = forge.pki.rsa.generateKeyPair(2048);
	const cert = forge.pki.createCertificate();
	cert.publicKey = keys.publicKey;
	cert.serialNumber = "01";
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
	const attrs = [{ name: "commonName", value: "J floor Test" }];
	cert.setSubject(attrs);
	cert.setIssuer(attrs);
	cert.sign(keys.privateKey, forge.md.sha256.create());
	const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
		algorithm: "3des",
	});
	return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

function countOccurrences(buf: Uint8Array, needle: string): number {
	return Buffer.from(buf).toString("latin1").split(needle).length - 1;
}

describe("sealWith", () => {
	it("appends a PAdES signature without re-packing the source PDF", async () => {
		const pdf = await makePdf();
		const p12 = makeTestP12(PASS);
		const sealed = await sealWith(pdf, p12, PASS);

		// Still a PDF.
		expect(Buffer.from(sealed.slice(0, 5)).toString()).toBe("%PDF-");
		// Carries a signature dict + byte range.
		const text = Buffer.from(sealed).toString("latin1");
		expect(text).toContain("/ByteRange");
		expect(text).toContain("/Type /Sig");
		// Append-only: the original bytes are an exact prefix of the sealed file.
		expect(Buffer.from(sealed.subarray(0, pdf.length))).toEqual(
			Buffer.from(pdf)
		);
		// Font-regression guard: sealing introduces NO new object streams.
		expect(countOccurrences(sealed, "/ObjStm")).toBe(
			countOccurrences(pdf, "/ObjStm")
		);
		// And it actually grew (the seal was added).
		expect(sealed.length).toBeGreaterThan(pdf.length);
	}, 20000);

	it("seals a realistic drawn PDF (with Typst font subsets) append-only and without introducing new /ObjStm", async () => {
		// Build a realistic drawn PDF using the committed member template, which
		// contains Typst font subsets — this makes the /ObjStm guard non-vacuous.
		const template = new Uint8Array(
			Buffer.from(TEMPLATES.member.bytesBase64, "base64")
		);
		const signaturePng = validatePngDataUrl(PNG_1PX);
		const drawn = await drawSignedPdf(template, {
			variant: "member",
			name: "Ada",
			company: "Engine",
			email: "a@b.c",
			date: "19 June 2026",
			signaturePng,
			board: [{ name: "Boss", role: "Chair" }],
		});

		const p12 = makeTestP12(PASS);
		const sealed = await sealWith(drawn, p12, PASS);

		// Still a valid PDF.
		expect(Buffer.from(sealed.slice(0, 5)).toString()).toBe("%PDF-");
		// Carries a PAdES signature.
		const text = Buffer.from(sealed).toString("latin1");
		expect(text).toContain("/ByteRange");
		expect(text).toContain("/Type /Sig");
		// Append-only: original drawn bytes are an exact prefix.
		expect(Buffer.from(sealed.subarray(0, drawn.length))).toEqual(
			Buffer.from(drawn)
		);
		// Font-regression guard (non-vacuous for a real Typst PDF): no new /ObjStm.
		expect(countOccurrences(sealed, "/ObjStm")).toBe(
			countOccurrences(drawn, "/ObjStm")
		);
		// Grew (the seal was appended).
		expect(sealed.length).toBeGreaterThan(drawn.length);
	}, 20000);
});

describe("certFingerprintFromP12", () => {
	it("returns a 64-char lowercase hex string for a freshly generated cert", () => {
		const p12 = makeTestP12(PASS);
		const fp = certFingerprintFromP12(p12, PASS);
		expect(fp).toMatch(/^[0-9a-f]{64}$/);
	}, 20000);
});

describe("sha256Hex", () => {
	it("is stable and 64 hex chars", () => {
		const h = sha256Hex(new Uint8Array([1, 2, 3]));
		expect(h).toMatch(/^[0-9a-f]{64}$/);
		expect(sha256Hex(new Uint8Array([1, 2, 3]))).toBe(h);
	});
});
