import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

const COMMENT = /\/\*[\s\S]*?\*\//g;
const DURATION_DECLARATION = /(--jf-animation-duration-[a-z]+): (\d+m?s);/g;
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";
const BLOCK_END = "\n\t}";
const ZERO = /^0(?:ms|s)$/;

const source = readFileSync(
	`${import.meta.dirname}/base.scss`,
	"utf8"
).replaceAll(COMMENT, "");
const [atRest = "", afterMarker = ""] = source.split(REDUCED_MOTION);
const reduced = afterMarker.split(BLOCK_END)[0] ?? "";

function declarations(css: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const [, token, value] of css.matchAll(DURATION_DECLARATION)) {
		found.set(token, value);
	}
	return found;
}

test("every duration token is zero under reduced motion", () => {
	const tokens = [...declarations(atRest).keys()];
	expect(tokens.length).toBeGreaterThan(0);
	const zeroed = declarations(reduced);
	for (const token of tokens) {
		expect(zeroed.get(token), token).toMatch(ZERO);
	}
});

test("the reduced block sets no token the rest does not declare", () => {
	const root = declarations(atRest);
	for (const token of declarations(reduced).keys()) {
		expect(root.has(token), token).toBe(true);
	}
});
