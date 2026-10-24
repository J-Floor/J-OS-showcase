import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import * as morphNames from "../utils/morphNames.ts";

const STYLESHEETS = [
	"styles/viewTransition.scss",
	"components/Table/Table.module.scss",
];

/** A morph attribute or a custom property the morph code writes. */
const MORPH_NAME = /data-morph-[a-z-]*[a-z]|--jf-(?:morph|ghost)-[a-z-]*[a-z]/g;
/** A custom property the stylesheet declares itself. */
const DECLARED = /(--jf-(?:morph|ghost)-[a-z-]*[a-z])\s*:/g;
const COMMENT = /\/\*[\s\S]*?\*\//g;

function withoutComments(path: string): string {
	return readFileSync(`${import.meta.dirname}/../${path}`, "utf8").replaceAll(
		COMMENT,
		""
	);
}

/** Every string the names module spells, its lists and records included. */
function moduleNames(): Set<unknown> {
	return new Set(
		Object.values(morphNames).flatMap((value): unknown[] =>
			typeof value === "object" ? Object.values(value) : [value]
		)
	);
}

test.each(STYLESHEETS)(
	"every morph attribute and var %s reads is spelled in morphNames",
	(path) => {
		const source = withoutComments(path);
		const declared = new Set(
			[...source.matchAll(DECLARED)].map((match) => match[1])
		);
		const used = new Set(
			[...source.matchAll(MORPH_NAME)]
				.map((match) => match[0])
				.filter((name) => !declared.has(name))
		);
		expect(used.size).toBeGreaterThan(0);
		const names = moduleNames();
		expect([...used].filter((name) => !names.has(name))).toEqual([]);
	}
);
