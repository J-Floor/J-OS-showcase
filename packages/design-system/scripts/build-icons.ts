import { readFileSync, writeFileSync } from "node:fs";

import subsetFont from "subset-font";

import {
	displayPath,
	ICON_LIST,
	iconGlyphId,
	listedIconNames,
	openFont,
	SOURCE_FONT,
	SUBSET_FONT,
	usedIconNames,
} from "./icons.ts";

const LIGATURE_INPUT = "abcdefghijklmnopqrstuvwxyz0123456789_";
const KEPT_FEATURES = ["liga", "rlig", "ccmp", "locl", "calt"];

function codePointByGlyph(font: ReturnType<typeof openFont>) {
	const byGlyph = new Map<number, number>();
	for (const codePoint of font.characterSet) {
		const id = font.glyphForCodePoint(codePoint).id;
		if (!byGlyph.has(id)) byGlyph.set(id, codePoint);
	}
	return byGlyph;
}

function buildSubset(names: string[]): Promise<Buffer> {
	const source = openFont(SOURCE_FONT);
	const byGlyph = codePointByGlyph(source);
	const iconCodePoints = names.map((name) => {
		const id = iconGlyphId(source, name);
		const codePoint = id === undefined ? undefined : byGlyph.get(id);
		if (codePoint === undefined)
			throw new Error(`No glyph for icon ${name}`);
		return String.fromCodePoint(codePoint);
	});
	// Layout closure would pull in every ligature spellable from the letters.
	return subsetFont(
		readFileSync(SOURCE_FONT),
		LIGATURE_INPUT + iconCodePoints.join(""),
		{
			targetFormat: "woff2",
			noLayoutClosure: true,
			keepFeatures: KEPT_FEATURES,
		}
	);
}

function check(): void {
	const listed = new Set(listedIconNames());
	const missing = usedIconNames().filter((name) => !listed.has(name));
	if (missing.length > 0) {
		throw new Error(
			`Icons used in code but missing from ${displayPath(ICON_LIST)}: ${missing.join(", ")}. Run \`bun run icons:build\`.`
		);
	}
	const subset = openFont(SUBSET_FONT);
	const unrendered = [...listed].filter(
		(name) => iconGlyphId(subset, name) === undefined
	);
	if (unrendered.length > 0) {
		throw new Error(
			`${displayPath(SUBSET_FONT)} does not render: ${unrendered.join(", ")}. Run \`bun run icons:build\`.`
		);
	}
}

if (process.argv.includes("--check")) {
	check();
} else {
	const names = usedIconNames();
	writeFileSync(ICON_LIST, names.join("\n") + "\n");
	writeFileSync(SUBSET_FONT, await buildSubset(names));
	check();
}
