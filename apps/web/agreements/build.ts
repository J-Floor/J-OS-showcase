// apps/web/agreements/build.ts
// Compiles the branded PDFs from their Typst sources and syncs the agreement
// templates into base64 TypeScript modules the Convex backend imports
// (`convex/agreements/generated/templates.ts`).
//
// Every PDF in DOCUMENTS is compiled here with the **Typst CLI** (pinned to
// 0.15.0 — other versions produce different bytes) and committed:
//   - `agreements:build` compiles each .typ into a temp dir, runs the version
//     guard, and only then writes the committed PDFs and regenerates templates.ts,
//     and fonts.ts. A template whose bytes changed must also
//     bump its version in VARIANTS.
//   - `agreements:check` (CI) compiles each .typ into a temp dir and fails if a
//     committed PDF differs, then verifies the generated files are in sync.
// Install Typst 0.15.0 locally (https://github.com/typst/typst/releases/tag/v0.15.0);
// CI installs it in .github/workflows/checks.yml. The brand fonts in ./fonts are
// variable, so Typst gets `--font-path` plus `--ignore-system-fonts` and
// `SOURCE_DATE_EPOCH=0` for reproducible bytes.
//
// The static font instances in ./static-fonts (used by pdf-lib at runtime —
// the ./fonts files are variable and pdf-lib would embed their thinnest
// default weight) are generated once with fonttools:
//
//   uvx --from fonttools fonttools varLib.instancer agreements/fonts/Manrope.ttf wght=400 --static --update-name-table -o agreements/static-fonts/Manrope-Regular.ttf
//   uvx --from fonttools fonttools varLib.instancer agreements/fonts/Manrope.ttf wght=700 --static --update-name-table -o agreements/static-fonts/Manrope-Bold.ttf
//   uvx --from fonttools fonttools varLib.instancer agreements/fonts/AzeretMono.ttf wght=400 --static --update-name-table -o agreements/static-fonts/AzeretMono-Regular.ttf
//
// Keep them out of ./fonts so Typst never resolves them.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);
const WEB = resolve(ROOT, "..");
const GEN = resolve(ROOT, "../convex/agreements/generated/templates.ts");
const STATIC_FONTS = resolve(ROOT, "static-fonts");
const GEN_FONTS = resolve(ROOT, "../convex/agreements/generated/fonts.ts");

const VARIANTS = [
	{ key: "member", version: "member-2026-10" },
	{ key: "guest", version: "guest-2026-10" },
] as const;

const TYPST_VERSION = "0.15.0";

/** Every PDF compiled from a Typst source, paths relative to apps/web. */
const DOCUMENTS = [
	{ src: "agreements/member.typ", out: "public/agreements/member.pdf" },
	{ src: "agreements/guest.typ", out: "public/agreements/guest.pdf" },
	{
		src: "src/modules/inventory/print/letterhead.typ",
		out: "src/modules/inventory/print/letterhead.pdf",
	},
] as const;

function failTypst(message: string, detail?: string): never {
	console.error(message);
	if (detail) {
		console.error(detail);
	}
	process.exit(1);
}

function assertTypstVersion(): void {
	const res = spawnSync("typst", ["--version"], {
		cwd: WEB,
		encoding: "utf8",
	});
	if (res.error || res.status !== 0) {
		failTypst(
			`[agreements] typst not found — install ${TYPST_VERSION}, see build.ts header`,
			res.error?.message
		);
	}
	if (!res.stdout.startsWith(`typst ${TYPST_VERSION}`)) {
		failTypst(
			`[agreements] typst ${TYPST_VERSION} required, found: ${res.stdout.trim()}`
		);
	}
}

function compile(src: string, out: string): void {
	const res = spawnSync(
		"typst",
		[
			"compile",
			"--root",
			WEB,
			"--font-path",
			"agreements/fonts",
			"--ignore-system-fonts",
			src,
			out,
		],
		{
			cwd: WEB,
			encoding: "utf8",
			env: { ...process.env, SOURCE_DATE_EPOCH: "0" },
		}
	);
	if (res.error) {
		failTypst(
			`[agreements] typst not found — install ${TYPST_VERSION}, see build.ts header`,
			res.error.message
		);
	}
	if (res.status !== 0) {
		console.error(`[agreements] typst failed compiling ${src}`);
		console.error(res.stderr);
		process.exit(1);
	}
}

/** Compile every document into a temp dir and return the fresh bytes, in
 * DOCUMENTS order. Nothing committed is touched. */
async function compileToTemp(): Promise<Buffer[]> {
	const dir = await mkdtemp(join(tmpdir(), "agreements-"));
	// compile() may process.exit, which skips `finally`; clean up on exit instead.
	process.on("exit", () => {
		rmSync(dir, { recursive: true, force: true });
	});
	const fresh: Buffer[] = [];
	for (const [i, doc] of DOCUMENTS.entries()) {
		const tmpOut = join(dir, `${i}.pdf`);
		compile(doc.src, tmpOut);
		fresh.push(await readFile(tmpOut));
	}
	return fresh;
}

/** Fail naming each committed PDF whose bytes differ from the fresh compile. */
async function assertCommittedPdfsFresh(fresh: Buffer[]): Promise<void> {
	const stale: string[] = [];
	for (const [i, doc] of DOCUMENTS.entries()) {
		const committed = await readFile(resolve(WEB, doc.out)).catch(
			() => null
		);
		if (!committed?.equals(fresh[i])) {
			stale.push(doc.out);
		}
	}
	for (const path of stale) {
		console.error(
			`[agreements:check] ${path} is out of date with its .typ source — run agreements:build`
		);
	}
	if (stale.length > 0) {
		process.exit(1);
	}
}

/** Fail when a variant's template bytes changed but its version did not. */
async function assertVersionsBumped(
	out: Record<string, { sha256: string }>
): Promise<void> {
	const cur = await readFile(GEN, "utf8").catch(() => "");
	let unbumped = false;
	for (const v of VARIANTS) {
		const oldSha = new RegExp(
			`"${v.key}": \\{\\s*"bytesBase64": "[^"]*",\\s*"sha256": "([0-9a-f]+)"`
		).exec(cur)?.[1];
		const oldVersion = new RegExp(`"${v.key}": "([^"]+)"`).exec(cur)?.[1];
		if (
			oldSha !== undefined &&
			oldSha !== out[v.key].sha256 &&
			oldVersion === v.version
		) {
			console.error(
				`[agreements:build] ${v.key} template changed — bump its version in VARIANTS (and the .typ AGREEMENT_VERSION comment)`
			);
			unbumped = true;
		}
	}
	if (unbumped) {
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const check = process.argv.includes("--check");

	assertTypstVersion();
	const fresh = await compileToTemp();
	if (check) {
		await assertCommittedPdfsFresh(fresh);
	}

	const out: Record<string, { bytesBase64: string; sha256: string }> = {};
	const versions: Record<string, string> = {};

	for (const v of VARIANTS) {
		const bytes =
			fresh[DOCUMENTS.findIndex((d) => d.out.endsWith(`/${v.key}.pdf`))];
		if (bytes.length < 4096 || bytes.subarray(0, 4).toString() !== "%PDF") {
			console.error(`[agreements:build] ${v.key}.pdf is not a PDF`);
			process.exit(1);
		}
		out[v.key] = {
			bytesBase64: bytes.toString("base64"),
			sha256: createHash("sha256").update(bytes).digest("hex"),
		};
		versions[v.key] = v.version;
	}

	const manrope = await readFile(
		resolve(STATIC_FONTS, "Manrope-Regular.ttf")
	);
	const fontsSrc =
		`// AUTO-GENERATED by agreements/build.ts — do not edit.\n` +
		`// Run \`bun run --filter @j-os/web agreements:build\` to regenerate from agreements/static-fonts.\n` +
		`export const MANROPE_REGULAR_BASE64 = ${JSON.stringify(manrope.toString("base64"))};\n`;

	const src =
		`// AUTO-GENERATED by agreements/build.ts — do not edit.\n` +
		`// Run \`bun run --filter @j-os/web agreements:build\` to regenerate from the committed PDFs.\n` +
		`export const AGREEMENT_VERSION = ${JSON.stringify(versions, null, "\t")} as const;\n` +
		`export const TEMPLATES: Record<"member" | "guest", { bytesBase64: string; sha256: string }> = ${JSON.stringify(out, null, "\t")};\n`;

	if (check) {
		const cur = await readFile(GEN, "utf8").catch(() => "");
		const curFonts = await readFile(GEN_FONTS, "utf8").catch(() => "");
		if (cur !== src || curFonts !== fontsSrc) {
			console.error(
				"[agreements:check] generated templates/fonts are out of sync — run agreements:build"
			);
			process.exit(1);
		}
		console.log(
			"[agreements:check] PDFs match their sources; templates.ts + fonts.ts up to date"
		);
	} else {
		await assertVersionsBumped(out);
		for (const [i, doc] of DOCUMENTS.entries()) {
			await writeFile(resolve(WEB, doc.out), fresh[i]);
		}
		await writeFile(GEN, src, "utf8");
		await writeFile(GEN_FONTS, fontsSrc, "utf8");
		console.log("[agreements:build] wrote templates.ts + fonts.ts");
	}
}

await main();
