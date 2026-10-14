// apps/web/agreements/test-sign.ts
// Full local dry run of the agreement-signing pipeline: fills in a sample
// applicant, stamps a sample scribble for the applicant and each board member
// (real board PNGs live in Convex file storage), and writes out a finished PDF you can open and eyeball — without touching
// Convex or the database.
//
//   bun run --filter @j-os/web agreements:test-sign [member|guest|all]
//
// Output goes to agreements/test-signed-<variant>.pdf (gitignored — see
// `apps/web/agreements/*.pdf` in .gitignore — so it's never committed).
//
// If AGREEMENT_SIGNING_P12 / AGREEMENT_SIGNING_P12_PASS are set (see
// scripts/gen-signing-cert.sh), the output also gets the real PAdES seal,
// matching production exactly. Otherwise the script skips sealing and says
// so — the stamped fields and signatures are still fully visible.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

import {
	AGREEMENT_VERSION,
	TEMPLATES,
} from "../convex/agreements/generated/templates.ts";
import { drawSignedPdf, validatePngDataUrl } from "../convex/agreements/pdf.ts";
import { sealPdf, sha256Hex } from "../convex/agreements/seal.ts";
import { formatEmailDate } from "../convex/emails/format.ts";

const SAMPLE_BOARD = [
	{ name: "Hopper, Grace", role: "President of the board" },
	{ name: "Turing, Alan", role: "Vice-president of the board" },
];

const OUT_DIR = resolve(import.meta.dirname);

/** A simple scribble, rasterized to a PNG data URL — stands in for a pad-drawn
 * applicant signature (real ones come from the browser's signature pad). */
async function sampleSignatureDataUrl(): Promise<string> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80">
    <path d="M10 60 C 40 10, 60 10, 80 45 S 130 70, 150 40 S 190 5, 210 35
             S 250 65, 290 30" fill="none" stroke="#0a0a0a" stroke-width="4"
             stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	return `data:image/png;base64,${png.toString("base64")}`;
}

async function signOne(variant: "member" | "guest"): Promise<void> {
	const templateBuffer = Buffer.from(
		TEMPLATES[variant].bytesBase64,
		"base64"
	);
	const template = new Uint8Array(
		templateBuffer.buffer,
		templateBuffer.byteOffset,
		templateBuffer.byteLength
	);

	const signaturePng = validatePngDataUrl(await sampleSignatureDataUrl());

	// Real board PNGs live in Convex file storage; the dry run stamps the sample
	// scribble for every board member instead.
	const board = SAMPLE_BOARD.map((member) => ({
		name: member.name,
		role: member.role,
		signaturePng,
	}));

	const drawn = await drawSignedPdf(template, {
		variant,
		name: "Ada Lovelace",
		company: "Engine Co",
		email: "ada@example.com",
		date: formatEmailDate(Date.now()),
		signaturePng,
		board,
	});

	let final = drawn;
	let isSealed = false;
	if (
		process.env.AGREEMENT_SIGNING_P12 &&
		process.env.AGREEMENT_SIGNING_P12_PASS
	) {
		final = await sealPdf(drawn);
		isSealed = true;
	}

	const outPath = resolve(OUT_DIR, `test-signed-${variant}.pdf`);
	await writeFile(outPath, final);

	const boardSigners = board
		.map((member) => `${member.name} (with signature)`)
		.join(", ");

	console.log(
		`[test-sign] ${variant} (${AGREEMENT_VERSION[variant]}) → ${outPath}\n` +
			`  board signers: ${boardSigners}\n` +
			`  sealed: ${isSealed ? "yes" : "no (set AGREEMENT_SIGNING_P12 / _PASS to test sealing)"}\n` +
			`  sha256: ${sha256Hex(final)}`
	);
}

async function main(): Promise<void> {
	const argument = process.argv[2] ?? "all";
	if (!["member", "guest", "all"].includes(argument)) {
		console.error(
			`usage: bun run --filter @j-os/web agreements:test-sign [member|guest|all]`
		);
		process.exit(1);
	}
	// Fail fast with a clear message if the committed templates are stale.
	await readFile(resolve(OUT_DIR, "member.typ"));

	const variants: ("member" | "guest")[] =
		argument === "all"
			? ["member", "guest"]
			: [argument as "member" | "guest"];
	for (const variant of variants) await signOne(variant);
}

await main();
