import { describe, expect, it } from "vitest";

import { bundleProblems, valueExports } from "./bundles.ts";

const FULL = ["Thing.tsx", "Thing.demo.tsx", "Thing.test.tsx"];
const EXPORTED = `export { Thing } from "./components/Thing/Thing.tsx";\n`;

describe("valueExports", () => {
	it("collects the value names of every export list", () => {
		const source = `export {\n\tThing,\n\ttype ThingProps,\n\tuseThing as useIt,\n} from "./components/Thing/Thing.tsx";\nexport { Other } from "./components/Other/Other.tsx";\n`;
		expect(valueExports(source)).toEqual(
			new Set(["Thing", "useIt", "Other"])
		);
	});

	it("skips type-only export lists", () => {
		expect([
			...valueExports(`export type { Thing } from "./utils/types.ts";\n`),
		]).toEqual([]);
	});
});

describe("bundleProblems", () => {
	it("passes a component with its source, demo and test, exported", () => {
		expect(bundleProblems({ Thing: FULL }, EXPORTED)).toEqual([]);
	});

	it("does not ask a component without styles for a stylesheet", () => {
		expect(
			bundleProblems({ Thing: [...FULL, "Thing.module.scss"] }, EXPORTED)
		).toEqual([]);
		expect(bundleProblems({ Thing: FULL }, EXPORTED)).toEqual([]);
	});

	it("reports each missing bundle file", () => {
		expect(bundleProblems({ Thing: ["Thing.tsx"] }, EXPORTED)).toEqual([
			"components/Thing: missing Thing.demo.tsx",
			"components/Thing: missing Thing.test.tsx",
		]);
	});

	it("reports a component index.ts does not export", () => {
		expect(bundleProblems({ Thing: FULL }, "")).toEqual([
			"components/Thing: index.ts does not export Thing",
		]);
	});

	it("does not count another export of the directory as the component", () => {
		const others = `export { ThingProvider, type Thing } from "./components/Thing/Thing.tsx";\n`;
		expect(bundleProblems({ Thing: FULL }, others)).toEqual([
			"components/Thing: index.ts does not export Thing",
		]);
	});

	it("reports a directory with no component file at all", () => {
		expect(bundleProblems({ helpers: ["format.ts"] }, "")).toEqual([
			"components/helpers: missing helpers.tsx",
			"components/helpers: missing helpers.demo.tsx",
			"components/helpers: missing helpers.test.tsx",
			"components/helpers: index.ts does not export helpers",
		]);
	});
});
