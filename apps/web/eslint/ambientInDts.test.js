// @vitest-environment node
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { ambientInDts } from "./ambientInDts.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

const GLOBAL = `export {};\ndeclare global { interface Window { x?: number } }`;
const MODULE = `declare module "solid-js" { namespace JSX { interface Directives { d: unknown } } }`;

ruleTester.run("ambient-in-dts", ambientInDts, {
	valid: [
		{ code: GLOBAL, filename: "src/shared/window.d.ts" },
		{ code: MODULE, filename: "src/modules/x/directives.d.ts" },
		{
			code: `export namespace Local { export const a = 1; }`,
			filename: "src/a.ts",
		},
	],
	invalid: [
		{
			code: GLOBAL,
			filename: "src/shared/window.ts",
			errors: [{ messageId: "moveToDts" }],
		},
		{
			code: MODULE,
			filename: "src/modules/x/directives.tsx",
			errors: [{ messageId: "moveToDts" }],
		},
	],
});
