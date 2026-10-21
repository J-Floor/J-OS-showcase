// apps/web/convex/agreements/pdf.ts
import fontkit from "@pdf-lib/fontkit";
import { err, ok, type Result } from "neverthrow";
import { PDFDocument, rgb } from "pdf-lib";

import type { AgreementsError } from "../lib/errors/agreements.ts";
import { invariant } from "../lib/result.ts";

import { FIELD_COORDS, type Variant } from "./coords.ts";
import { MANROPE_REGULAR_BASE64 } from "./generated/fonts.ts";

const MAX_SIG_BYTES = 524_288;
const BASE64_BYTES_PER_GROUP = 3;
const BASE64_CHARS_PER_GROUP = 4;
const MAX_SIG_DATA_URL_LENGTH =
	"data:image/png;base64,".length +
	Math.ceil(MAX_SIG_BYTES / BASE64_BYTES_PER_GROUP) * BASE64_CHARS_PER_GROUP;

function base64ToBytes(b64: string): Uint8Array {
	return Uint8Array.from(atob(b64), (character) => character.charCodeAt(0));
}

/** Decode + validate a PNG data URL (size-capped), or say why it is refused. */
export function validatePngDataUrl(
	dataUrl: string
): Result<Uint8Array, AgreementsError> {
	if (dataUrl.length > MAX_SIG_DATA_URL_LENGTH)
		return err({ type: "SignatureTooLarge" });
	const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
	if (!match) return err({ type: "SignatureNotPng" });
	const bytes = base64ToBytes(match[1]);
	return bytes.byteLength === 0 || bytes.byteLength > MAX_SIG_BYTES
		? err({ type: "SignatureSizeInvalid" })
		: ok(bytes);
}

function allPrintable(printable: Set<number>, text: string): boolean {
	for (const character of text) {
		if (!printable.has(character.codePointAt(0) ?? 0)) return false;
	}
	return true;
}

export async function drawSignedPdf(
	templateBytes: Uint8Array,
	options: {
		variant: Variant;
		name: string;
		company: string;
		email: string;
		date: string;
		/** Omit for an unsigned preview (fields only, no signature stamp). */
		signaturePng?: Uint8Array;
		board: { name: string; role: string; signaturePng?: Uint8Array }[];
	}
): Promise<Result<Uint8Array, AgreementsError>> {
	const doc = await PDFDocument.load(templateBytes);
	doc.registerFontkit(fontkit);
	const font = await doc.embedFont(base64ToBytes(MANROPE_REGULAR_BASE64), {
		subset: true,
	});
	const printable = new Set(font.getCharacterSet());
	// The signature block is the final page (lib.typ pagebreaks before it), so
	// stamp the last page rather than a hardcoded index — robust if the body ever
	// grows past two pages.
	const pages = doc.getPages();
	const page = pages[pages.length - 1];
	const coords = FIELD_COORDS[options.variant];
	const black = rgb(0, 0, 0);
	// Refuse rather than stamp blank boxes for characters the font lacks: the
	// applicant's own fields as an error they can fix, the rest as a bug.
	const applicantFields = [options.name, options.company, options.email];
	if (!applicantFields.every((text) => allPrintable(printable, text)))
		return err({ type: "AgreementUnprintable" });
	function put(
		label: string,
		text: string,
		at: { x: number; y: number }
	): void {
		invariant(
			allPrintable(printable, text),
			`${label} contains characters the agreement cannot print`
		);
		page.drawText(text, { x: at.x, y: at.y, size: 11, font, color: black });
	}

	put("Name", options.name, coords.name);
	put("Company", options.company, coords.company);
	put("Email", options.email, coords.email);
	put("Date", options.date, coords.date);
	for (
		let index = 0;
		index < Math.min(options.board.length, coords.board.length);
		index++
	) {
		const signatory = options.board[index];
		const box = coords.board[index];
		// Board column has its own Name field AND a separate Signature field —
		// always type the name + role + date (the signing date, same as the
		// applicant's); add the signature image in its own field when present
		// (left blank there otherwise).
		const member = `Board member ${String(index + 1)}`;
		put(`${member} name`, signatory.name, box.name);
		put(`${member} role`, signatory.role, box.role);
		put("Date", options.date, box.date);
		if (signatory.signaturePng) {
			const bpng = await doc.embedPng(signatory.signaturePng);
			const bfit = Math.min(
				box.signature.w / bpng.width,
				box.signature.h / bpng.height
			);
			page.drawImage(bpng, {
				x: box.signature.x,
				y: box.signature.y,
				width: bpng.width * bfit,
				height: bpng.height * bfit,
			});
		}
	}

	// Fit the signature into its box (c.signature is a MAX width×height) while
	// preserving the drawn PNG's aspect ratio — forcing both dimensions would
	// stretch a square-ish pad drawing into the wide cell and distort it.
	// Omitted for the unsigned preview (fields only).
	if (options.signaturePng) {
		const png = await doc.embedPng(options.signaturePng);
		const fit = Math.min(
			coords.signature.w / png.width,
			coords.signature.h / png.height
		);
		page.drawImage(png, {
			x: coords.signature.x,
			y: coords.signature.y,
			width: png.width * fit,
			height: png.height * fit,
		});
	}

	// Save WITHOUT object streams: pdf-lib's default (object streams on) re-packs
	// the Typst-embedded font subsets into compressed object streams that browser
	// PDF viewers fail to resolve, so the body text falls back to a default font.
	// Plain xref keeps the FontFile programs where viewers find them.
	return ok(await doc.save({ useObjectStreams: false }));
}
