import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import * as morphNames from "../utils/morphNames.ts";
import { TABLE_GROUP_CLASS, TABLE_ROW_CLASS } from "../utils/viewTransition.ts";

const SOURCE_ROOT = join(import.meta.dirname, "..");
const STYLESHEET = /\.s?css$/;
/** The hover mixin: the one place the pinned selector is written
 *  (hover.contract.test.ts checks its spelling). */
const HOVER_MIXIN = "styles/_hover.scss";
/** The stylesheet with every `::view-transition-*` rule. */
const TRANSITIONS = "styles/viewTransition.scss";

/** A morph attribute or a custom property the morph code (or a table
 *  group's motion) writes. */
const MORPH_NAME =
	/data-morph-[a-z-]*[a-z]|--jf-(?:morph|ghost|table-row)-[a-z0-9-]*[a-z]/g;
/** A custom property the stylesheet declares itself. */
const DECLARED = /(--jf-(?:morph|ghost|table-row)-[a-z0-9-]*[a-z])\s*:/g;
/** The pinned attribute with its value: the selector the mixin writes. A
 *  bare `[data-morph-pinned]` test is not one. */
const PINNED_SELECTOR = /data-morph-pinned\s*=/;
const COMMENT = /\/\*[\s\S]*?\*\//g;
/** The box-flight slot in the stylesheet's `@for` loop, read as its first
 *  slot: the names module spells every slot's vars. */
const SLOT = /#\{\$slot\}/g;

function withoutComments(path: string): string {
	return readFileSync(join(SOURCE_ROOT, path), "utf8")
		.replaceAll(COMMENT, "")
		.replaceAll(SLOT, "0");
}

/** Every stylesheet under src/, as a path relative to it. */
const STYLESHEETS = readdirSync(SOURCE_ROOT, {
	recursive: true,
	encoding: "utf8",
}).filter((path) => STYLESHEET.test(path));

/** The stylesheets that style a morph attribute or var. */
const MORPH_STYLESHEETS = STYLESHEETS.filter(
	(path) => withoutComments(path).match(MORPH_NAME) !== null
);

/** Every string in `value`, its lists and records included, at any depth. */
function stringsIn(value: unknown): unknown[] {
	return typeof value === "object" && value !== null
		? Object.values(value).flatMap((item) => stringsIn(item))
		: [value];
}

/** Every string the names module spells. */
function moduleNames(): Set<unknown> {
	return new Set(stringsIn(morphNames));
}

test("the morph's own stylesheets are among those read", () => {
	expect(MORPH_STYLESHEETS).toContain(TRANSITIONS);
	expect(MORPH_STYLESHEETS).toContain(HOVER_MIXIN);
});

test.each(MORPH_STYLESHEETS)(
	"every morph attribute and var %s reads is spelled in morphNames",
	(path) => {
		const source = withoutComments(path);
		const declared = new Set(
			[...source.matchAll(DECLARED)].map((match) => match[1])
		);
		const used = [...source.matchAll(MORPH_NAME)]
			.map((match) => match[0])
			.filter((name) => !declared.has(name));
		const names = moduleNames();
		expect(used.filter((name) => !names.has(name))).toEqual([]);
	}
);

test("only the hover mixin writes the pinned selector", () => {
	const writers = STYLESHEETS.filter((path) =>
		PINNED_SELECTOR.test(withoutComments(path))
	);
	expect(writers).toEqual([HOVER_MIXIN]);
});

test("the stylesheet has a box-flight slot for each one the morph code fills", () => {
	const source = withoutComments(TRANSITIONS);
	const slots = /\$box-slots:\s*(\d+);/.exec(source)?.[1];
	expect(Number(slots)).toBe(morphNames.MORPH_BOX_SLOTS);
});

/** A rule's body, all whitespace dropped: what follows `selector` (written
 *  without spaces) up to its closing brace. The formatter may break a long
 *  selector inside its parentheses. */
function ruleAfter(source: string, selector: string): string | undefined {
	const flat = source.replaceAll(/\s/g, "");
	const start = flat.indexOf(selector);
	return start === -1
		? undefined
		: flat.slice(start, flat.indexOf("}", start));
}

const ROW = `*.${TABLE_ROW_CLASS}`;
const DEFAULT_MOTION =
	/--jf-animation-duration-default[\s\S]*--jf-animation-ease-standard/;

test("the table-row family glides on the default duration and standard ease", () => {
	const source = withoutComments(TRANSITIONS);
	expect(ruleAfter(source, `::view-transition-group(${ROW})`)).toMatch(
		DEFAULT_MOTION
	);
	expect(source).toContain(`::view-transition-group(*.${TABLE_GROUP_CLASS})`);
});

test.each([
	["table-collapse", "old", "jf-vt-out-up"],
	["table-expand", "new", "jf-vt-in-above"],
] as const)(
	"a %s slides the rows only its %s snapshot has, under their header",
	(kind, image, keyframes) => {
		const source = withoutComments(TRANSITIONS);
		const rule = ruleAfter(
			source,
			`:root[data-vt~="${kind}"]::view-transition-${image}(${ROW}):only-child`
		);
		expect(rule).toContain(keyframes);
		expect(rule).toMatch(DEFAULT_MOTION);
	}
);

test("the table rows' snapshots are cut to the table's visible width", () => {
	const source = withoutComments(TRANSITIONS);
	expect(source).toContain(`clip-path: var(${morphNames.TABLE_ROW_CLIP_VAR}`);
});
