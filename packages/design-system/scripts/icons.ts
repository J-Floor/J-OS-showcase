import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import * as fontkit from "fontkit";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const REPO_ROOT = join(PACKAGE_ROOT, "../..");

export const ICON_LIST = join(PACKAGE_ROOT, "src/styles/icons.txt");
export const SUBSET_FONT = join(
	PACKAGE_ROOT,
	"src/styles/material-symbols-sharp-subset.woff2"
);
export const SOURCE_FONT = join(
	PACKAGE_ROOT,
	"node_modules/@fontsource-variable/material-symbols-sharp/files/material-symbols-sharp-latin-fill-normal.woff2"
);

const SCAN_ROOTS = [
	join(PACKAGE_ROOT, "src"),
	join(PACKAGE_ROOT, "demo"),
	join(REPO_ROOT, "apps/web/src"),
	join(REPO_ROOT, "apps/web/convex"),
	join(REPO_ROOT, "apps/landing-page/src"),
];
const SKIPPED_DIRS = new Set([
	"node_modules",
	"dist",
	"generated",
	"_generated",
]);
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;
const QUOTED_NAME = /["'`]([a-z][a-z0-9_]*)["'`]/g;
const JSX_TEXT_NAME = />\s*([a-z][a-z0-9_]*)\s*</g;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
		}
		return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
			? [path]
			: [];
	});
}

export function openFont(path: string): fontkit.Font {
	const font = fontkit.openSync(path);
	if (!("layout" in font)) throw new Error(`${path} is a font collection`);
	return font;
}

/** The ligature glyph an icon name shapes to, or undefined when the name is
 *  not an icon in this font (it shapes to its plain letters). */
export function iconGlyphId(
	font: fontkit.Font,
	name: string
): number | undefined {
	const { glyphs } = font.layout(name);
	return name.length > 1 && glyphs.length === 1 ? glyphs[0]?.id : undefined;
}

/** Every string in app and design-system code that is an icon name of the
 *  full font. Deliberately generous: a plain word that happens to be an icon
 *  name costs one glyph, a missed icon renders as text. */
export function usedIconNames(): string[] {
	const font = openFont(SOURCE_FONT);
	const candidates = new Set<string>();
	for (const root of SCAN_ROOTS) {
		for (const file of sourceFiles(root)) {
			const text = readFileSync(file, "utf8");
			for (const pattern of [QUOTED_NAME, JSX_TEXT_NAME]) {
				for (const match of text.matchAll(pattern)) {
					if (match[1]) candidates.add(match[1]);
				}
			}
		}
	}
	return [...candidates]
		.filter((name) => iconGlyphId(font, name) !== undefined)
		.sort();
}

export function listedIconNames(): string[] {
	return readFileSync(ICON_LIST, "utf8").split("\n").filter(Boolean);
}

export function displayPath(path: string): string {
	return relative(REPO_ROOT, path);
}
