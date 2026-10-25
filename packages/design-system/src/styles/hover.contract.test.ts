import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { MORPH_PINNED_SELECTOR } from "../utils/morphNames.ts";

const PINNED = /\$morph-pinned:\s*'([^']*)';/;

test("the hover mixin matches the element a morph pins, as morph.ts spells it", () => {
	const source = readFileSync(`${import.meta.dirname}/_hover.scss`, "utf8");
	expect(PINNED.exec(source)?.[1]).toBe(MORPH_PINNED_SELECTOR);
	expect(source).toMatch(/&:hover,\s*&#\{\$morph-pinned\}\s*\{\s*@content;/);
});
