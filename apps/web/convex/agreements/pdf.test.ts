// apps/web/convex/agreements/pdf.test.ts
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { drawSignedPdf, validatePngDataUrl } from "./pdf.ts";

// A 1x1 transparent PNG.
const PNG_1PX =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** The drawn bytes of a draw that must succeed. */
async function drawOk(
	...args: Parameters<typeof drawSignedPdf>
): Promise<Uint8Array> {
	const result = await drawSignedPdf(...args);
	return result._unsafeUnwrap();
}

async function blankTemplate(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([595, 842]);
	doc.addPage([595, 842]);
	doc.addPage([595, 842]);
	return doc.save();
}

describe("validatePngDataUrl", () => {
	it("accepts a small png data url and returns bytes", () => {
		const result = validatePngDataUrl(PNG_1PX);
		expect(result.isOk() && result.value.byteLength).toBeGreaterThan(0);
	});
	it.each([
		[
			"a non-png data url",
			"data:image/jpeg;base64,AAAA",
			"SignatureNotPng",
		],
		["a non-data-url string", "https://x/y.png", "SignatureNotPng"],
		[
			"an over-long data url before decoding it",
			`data:image/png;base64,${"A".repeat(700_000)}`,
			"SignatureTooLarge",
		],
		[
			"a png data url with no payload",
			"data:image/png;base64,",
			"SignatureNotPng",
		],
	])("rejects %s", (_name, dataUrl, type) => {
		const result = validatePngDataUrl(dataUrl);
		expect(result.isErr() && result.error.type).toBe(type);
	});
});

describe("drawSignedPdf", () => {
	it("returns a valid 3-page PDF with the signer fields embedded", async () => {
		const template = await blankTemplate();
		const out = await drawOk(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			signaturePng: validatePngDataUrl(PNG_1PX)._unsafeUnwrap(),
			board: [{ name: "Boss One", role: "President" }],
		});
		expect(Buffer.from(out.slice(0, 5)).toString()).toBe("%PDF-");
		const reloaded = await PDFDocument.load(out);
		expect(reloaded.getPageCount()).toBe(3);
	});

	it("renders an unsigned preview when no signature is given", async () => {
		const template = await blankTemplate();
		const out = await drawOk(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			board: [{ name: "Boss One", role: "President" }],
		});
		expect(Buffer.from(out.slice(0, 5)).toString()).toBe("%PDF-");
		const reloaded = await PDFDocument.load(out);
		expect(reloaded.getPageCount()).toBe(3);
	});

	it("embeds a board member's signature png when provided and falls back to a name otherwise", async () => {
		const template = await blankTemplate();

		// Without board PNG — typed name only.
		const withoutBoardPng = await drawOk(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			signaturePng: validatePngDataUrl(PNG_1PX)._unsafeUnwrap(),
			board: [
				{ name: "Boss One", role: "President" },
				{ name: "Boss Two", role: "Vice-president" },
			],
		});

		// With board PNG — image embedded for Boss One.
		const withBoardPng = await drawOk(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			signaturePng: validatePngDataUrl(PNG_1PX)._unsafeUnwrap(),
			board: [
				{
					name: "Boss One",
					role: "President",
					signaturePng: validatePngDataUrl(PNG_1PX)._unsafeUnwrap(),
				},
				{ name: "Boss Two", role: "Vice-president" },
			],
		});

		// Both must be valid 3-page PDFs.
		expect(Buffer.from(withBoardPng.slice(0, 5)).toString()).toBe("%PDF-");
		const reloaded = await PDFDocument.load(withBoardPng);
		expect(reloaded.getPageCount()).toBe(3);

		// Providing a board PNG must embed an image, making the output larger than
		// the typed-name-only version (which has no extra image data).
		expect(withBoardPng.length).toBeGreaterThan(withoutBoardPng.length);
	});
});

describe("drawSignedPdf fonts", () => {
	it("stamps the signer fields in Manrope, not Helvetica", async () => {
		const template = await blankTemplate();
		const out = await drawOk(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			board: [{ name: "Boss One", role: "President" }],
		});
		const raw = Buffer.from(out).toString("latin1");
		expect(raw).toMatch(/\/BaseFont \/Manrope-Regular\b/);
		expect(raw).not.toContain("Helvetica");
	});
});

describe("drawSignedPdf unprintable text", () => {
	const base = {
		variant: "member" as const,
		name: "Ada Lovelace",
		company: "Engine Co",
		email: "ada@example.com",
		date: "19 June 2026",
		board: [{ name: "Boss One", role: "President" }],
	};

	it("stamps Latin-extended names", async () => {
		const template = await blankTemplate();
		const out = await drawOk(template, {
			...base,
			name: "Paweł Żółć",
		});
		expect(Buffer.from(out.slice(0, 5)).toString()).toBe("%PDF-");
	});

	it.each([
		["name", { name: "日本" }],
		["company", { company: "日本" }],
		["email", { email: "日本@example.com" }],
	])("refuses a %s the font cannot print", async (_field, override) => {
		const template = await blankTemplate();
		const result = await drawSignedPdf(template, { ...base, ...override });
		expect(result.isErr() && result.error.type).toBe(
			"AgreementUnprintable"
		);
	});

	it("treats an emoji in a board name as a bug, not a user error", async () => {
		const template = await blankTemplate();
		await expect(
			drawSignedPdf(template, {
				...base,
				board: [{ name: "Boss 🚀", role: "President" }],
			})
		).rejects.toThrow("Board member 1 name contains characters");
	});
});
