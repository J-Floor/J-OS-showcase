import { readdirSync, readFileSync } from "node:fs";

import { bundleProblems } from "./bundles.ts";

const SOURCE = new URL("../src/", import.meta.url);
const COMPONENTS = new URL("components/", SOURCE);

const directories = Object.fromEntries(
	readdirSync(COMPONENTS, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => [
			entry.name,
			readdirSync(new URL(`${entry.name}/`, COMPONENTS)),
		])
);
const problems = bundleProblems(
	directories,
	readFileSync(new URL("index.ts", SOURCE), "utf8")
);

if (problems.length > 0) {
	throw new Error(
		[
			"Component bundles are incomplete (X.tsx, X.demo.tsx, X.test.tsx, exported from index.ts):",
			...problems.map((problem) => `  ${problem}`),
		].join("\n")
	);
}
