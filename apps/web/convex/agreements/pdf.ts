// apps/web/convex/agreements/pdf.ts
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import { FIELD_COORDS, type Variant } from "./coords.ts";
import { MANROPE_REGULAR_BASE64 } from "./generated/fonts.ts";

const MAX_SIG_BYTES = 512 * 1024;
const MAX_SIG_DATA_URL_LENGTH =
	"data:image/png;base64,".length + Math.ceil(MAX_SIG_BYTES / 3) * 4;

function base64ToBytes(b64: string): Uint8Array {
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Decode + validate a PNG data URL (size-capped). Throws otherwise. */
export function validatePngDataUrl(dataUrl: string): Uint8Array {
	if (dataUrl.length > MAX_SIG_DATA_URL_LENGTH)
		throw new Error("Signature image is too large");
	const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
	if (!m) throw new Error("Signature must be a PNG data URL");
	const bytes = base64ToBytes(m[1]);
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_SIG_BYTES) {
		throw new Error("Signature image is empty or too large");
	}
	return bytes;
}

export async function drawSignedPdf(
	templateBytes: Uint8Array,
	opts: {
		variant: Variant;
		name: string;
		company: string;
		email: string;
		date: string;
		/** Omit for an unsigned preview (fields only, no signature stamp). */
		signaturePng?: Uint8Array;
		board: { name: string; role: string; signaturePng?: Uint8Array }[];
	}
): Promise<Uint8Array> {
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
	const c = FIELD_COORDS[opts.variant];
	const black = rgb(0, 0, 0);
	// Refuse rather than stamp blank boxes for characters the font lacks.
	function put(label: string, t: string, at: { x: number; y: number }): void {
		for (const ch of t) {
			if (!printable.has(ch.codePointAt(0) ?? 0)) {
				throw new Error(
					`${label} contains characters the agreement cannot print`
				);
			}
		}
		page.drawText(t, { x: at.x, y: at.y, size: 11, font, color: black });
	}

	put("Name", opts.name, c.name);
	put("Company", opts.company, c.company);
	put("Email", opts.email, c.email);
	put("Date", opts.date, c.date);
	for (let i = 0; i < Math.min(opts.board.length, c.board.length); i++) {
		const b = opts.board[i];
		const box = c.board[i];
		// Board column has its own Name field AND a separate Signature field —
		// always type the name + role + date (the signing date, same as the
		// applicant's); add the signature image in its own field when present
		// (left blank there otherwise).
		const member = `Board member ${String(i + 1)}`;
		put(`${member} name`, b.name, box.name);
		put(`${member} role`, b.role, box.role);
		put("Date", opts.date, box.date);
		if (b.signaturePng) {
			const bpng = await doc.embedPng(b.signaturePng);
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
	if (opts.signaturePng) {
		const png = await doc.embedPng(opts.signaturePng);
		const fit = Math.min(
			c.signature.w / png.width,
			c.signature.h / png.height
		);
		page.drawImage(png, {
			x: c.signature.x,
			y: c.signature.y,
			width: png.width * fit,
			height: png.height * fit,
		});
	}

	// Save WITHOUT object streams: pdf-lib's default (object streams on) re-packs
	// the Typst-embedded font subsets into compressed object streams that browser
	// PDF viewers fail to resolve, so the body text falls back to a default font.
	// Plain xref keeps the FontFile programs where viewers find them.
	return doc.save({ useObjectStreams: false });
}
