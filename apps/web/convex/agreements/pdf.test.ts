// apps/web/convex/agreements/pdf.test.ts
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { drawSignedPdf, validatePngDataUrl } from "./pdf.ts";

// A 1x1 transparent PNG.
const PNG_1PX =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function blankTemplate(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([595, 842]);
	doc.addPage([595, 842]);
	doc.addPage([595, 842]);
	return doc.save();
}

describe("validatePngDataUrl", () => {
	it("accepts a small png data url and returns bytes", () => {
		const bytes = validatePngDataUrl(PNG_1PX);
		expect(bytes.byteLength).toBeGreaterThan(0);
	});
	it("rejects a non-png data url", () => {
		expect(() =>
			validatePngDataUrl("data:image/jpeg;base64,AAAA")
		).toThrow();
	});
	it("rejects a non-data-url string", () => {
		expect(() => validatePngDataUrl("https://x/y.png")).toThrow();
	});
	it("rejects an over-long data url before decoding it", () => {
		const huge = `data:image/png;base64,${"A".repeat(700_000)}`;
		expect(() => validatePngDataUrl(huge)).toThrow(
			"Signature image is too large"
		);
	});
});

describe("drawSignedPdf", () => {
	it("returns a valid 3-page PDF with the signer fields embedded", async () => {
		const template = await blankTemplate();
		const out = await drawSignedPdf(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			signaturePng: validatePngDataUrl(PNG_1PX),
			board: [{ name: "Boss One", role: "President" }],
		});
		expect(Buffer.from(out.slice(0, 5)).toString()).toBe("%PDF-");
		const reloaded = await PDFDocument.load(out);
		expect(reloaded.getPageCount()).toBe(3);
	});

	it("renders an unsigned preview when no signature is given", async () => {
		const template = await blankTemplate();
		const out = await drawSignedPdf(template, {
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
		const withoutBoardPng = await drawSignedPdf(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			signaturePng: validatePngDataUrl(PNG_1PX),
			board: [
				{ name: "Boss One", role: "President" },
				{ name: "Boss Two", role: "Vice-president" },
			],
		});

		// With board PNG — image embedded for Boss One.
		const withBoardPng = await drawSignedPdf(template, {
			variant: "member",
			name: "Ada Lovelace",
			company: "Engine Co",
			email: "ada@example.com",
			date: "19 June 2026",
			signaturePng: validatePngDataUrl(PNG_1PX),
			board: [
				{
					name: "Boss One",
					role: "President",
					signaturePng: validatePngDataUrl(PNG_1PX),
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
		const out = await drawSignedPdf(template, {
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
		const out = await drawSignedPdf(template, {
			...base,
			name: "Paweł Żółć",
		});
		expect(Buffer.from(out.slice(0, 5)).toString()).toBe("%PDF-");
	});

	it("rejects a company the font cannot print, naming the field", async () => {
		const template = await blankTemplate();
		const attempt = drawSignedPdf(template, { ...base, company: "日本" });
		await expect(attempt).rejects.toThrow(
			"Company contains characters the agreement cannot print"
		);
		await expect(attempt).rejects.not.toThrow("日本");
	});

	it("rejects an emoji in a board name", async () => {
		const template = await blankTemplate();
		await expect(
			drawSignedPdf(template, {
				...base,
				board: [{ name: "Boss 🚀", role: "President" }],
			})
		).rejects.toThrow("Board member 1 name contains characters");
	});
});
