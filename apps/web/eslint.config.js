import baseConfig, { INLINE_STYLE_RESTRICTIONS } from "@j-os/config-eslint";
import boundaries from "eslint-plugin-boundaries";
import solid from "eslint-plugin-solid";

import { ambientInDts } from "./eslint/ambientInDts.js";
import { HANDLE_RESULT, mustUseResult } from "./eslint/mustUseResult.js";
import { noCollectInMutation } from "./eslint/noCollectInMutation.js";

const neverthrowRules = { rules: { "must-use-result": mustUseResult } };
const convexRules = {
	rules: { "no-collect-in-mutation": noCollectInMutation },
};
const typeRules = { rules: { "ambient-in-dts": ambientInDts } };

const UNSAFE_UNWRAP_MESSAGE = `Handle the Result instead. ${HANDLE_RESULT}`;

const NO_THROW = {
	selector: "ThrowStatement",
	message:
		"Don't throw. Return err(...) for a failure a user can cause, or invariant(...) for a bug (convex/lib/result.ts).",
};

const NO_MORPH_ATTRIBUTE = {
	selector: "JSXAttribute[name.name=/^data-morph-/]",
	message:
		"Don't write data-morph-* attributes. Use morphId on Card.Root, List.Item or <Morph>, morphPart for a field and morphTitle for a title.",
};

// A rule's options replace the base config's, so keep its selectors.
const baseRestrictedSyntax = baseConfig
	.map((entry) => entry.rules?.["no-restricted-syntax"])
	.find(Boolean)
	.slice(1);
const baseRestrictedImports = baseConfig
	.map((entry) => entry.rules?.["no-restricted-imports"])
	.find(Boolean)[1];
const baseRestrictedProperties = baseConfig
	.map((entry) => entry.rules?.["no-restricted-properties"])
	.find(Boolean)
	.slice(1);

// Import layers for apps/web. src/AGENTS.md ("Layers") explains them.
const BOUNDARY_ELEMENTS = [
	{ type: "app", pattern: "src/routing" },
	{ type: "shell", pattern: "src/shell" },
	{ type: "module", pattern: "src/modules/*", capture: ["name"] },
	{ type: "shared", pattern: "src/shared" },
	{ type: "lib", pattern: "src/lib" },
	{ type: "sw", pattern: "src/sw" },
	{ type: "convex", pattern: "convex" },
];
// Two kinds of single file sit outside any folder element: the app entry
// points, and a module's entity.ts, its public surface (other modules may
// import it and nothing else of the module).
const BOUNDARY_FILES = [
	{ category: "appEntry", pattern: ["src/index.tsx", "src/app.tsx"] },
	{ category: "entity", pattern: "src/modules/*/entity.ts" },
];

const elementOf = (...types) => ({ element: { type: types } });
const APP = [elementOf("app"), { file: { categories: "appEntry" } }];
const ENTITY = { file: { categories: "entity" } };
// Packages are not layered. A file under src/ or convex/ that belongs to no
// element is not allowed as a target: UNKNOWN_FILE below rejects it.
const OUTSIDE_LAYERS = [{ module: { origin: ["external", "core"] } }];
const UNKNOWN_FILE = {
	module: { origin: "local" },
	element: { isUnknown: true },
	file: { isUnknown: true },
};
// Another module's files, except its entity.ts.
const OTHER_MODULE = {
	element: {
		type: "module",
		captured: { name: "!{{ from.element.captured.name }}" },
	},
	file: { isUnknown: true },
};

const toAnyOf = (...targets) => targets.flat().map((to) => ({ to }));

// The plugin skips imports inside one element (checkInternals is off), so an
// allow list never names its own layer. The last matching policy wins.
const BOUNDARY_POLICIES = [
	{
		from: APP,
		allow: [{ to: { module: { origin: "*" } } }],
	},
	{
		from: elementOf("shell"),
		allow: toAnyOf(
			OUTSIDE_LAYERS,
			elementOf("module", "shared", "lib", "convex")
		),
		disallow: toAnyOf(APP, elementOf("sw")),
		message:
			"shell/ may not import the app layer (index, app, routing) or sw/. Move what both need into shared/ or lib/.",
	},
	{
		from: elementOf("module"),
		allow: toAnyOf(
			OUTSIDE_LAYERS,
			ENTITY,
			elementOf("shared", "lib", "convex")
		),
		disallow: toAnyOf(OTHER_MODULE, APP, elementOf("shell", "sw")),
		message:
			"A module may import itself, another module's entity.ts, shared/, lib/ and convex/. Code several modules use belongs in shared/; code that composes modules belongs in shell/.",
	},
	{
		from: elementOf("shared"),
		allow: toAnyOf(OUTSIDE_LAYERS, elementOf("lib", "convex")),
		disallow: toAnyOf(APP, elementOf("shell", "module", "sw")),
		message:
			"shared/ may import only shared/, lib/ and convex/. Code that needs a module belongs in shell/ (it composes modules); code a module needs from another belongs in shared/.",
	},
	{
		from: elementOf("lib"),
		allow: toAnyOf(OUTSIDE_LAYERS, elementOf("convex")),
		disallow: toAnyOf(APP, elementOf("shell", "module", "shared", "sw")),
		message:
			"lib/ may import only lib/ and convex/. Code that needs shared/ or a module belongs in shared/.",
	},
	{
		from: elementOf("sw"),
		allow: toAnyOf(OUTSIDE_LAYERS, elementOf("lib", "convex")),
		disallow: toAnyOf(APP, elementOf("shell", "module", "shared")),
		message:
			"sw/ may import only sw/, lib/ and convex/: it runs outside the app.",
	},
	{
		from: elementOf("convex"),
		allow: toAnyOf(OUTSIDE_LAYERS),
		disallow: toAnyOf(
			APP,
			elementOf("shell", "module", "shared", "lib", "sw")
		),
		message:
			"convex/ must not import src/: the backend cannot depend on the frontend.",
	},
	{
		from: elementOf("shell", "module", "shared", "lib", "sw", "convex"),
		disallow: [{ to: UNKNOWN_FILE }],
		message:
			"This file belongs to no layer. Place it in routing/, shell/, modules/<name>/, shared/, lib/, sw/ or convex/ (see src/AGENTS.md, Layers).",
	},
];

export default [
	{ ignores: ["dist/**", "convex/_generated/**"] },
	...baseConfig,
	{
		// CLI build scripts: printing progress is their job.
		files: ["emails/**", "agreements/**"],
		rules: { "no-console": "off" },
	},
	{
		// Cohesive modules kept whole on purpose: splitting them would only move
		// code, not clarify it.
		files: [
			"convex/people.ts",
			"convex/schema.ts",
			"convex/applications.ts",
			"convex/seed.ts",
			"convex/lib/nukiClient.ts",
		],
		rules: { "max-lines": "off" },
	},
	{
		// jsx-email templates are React, not Solid.
		files: ["emails/**"],
		rules: Object.fromEntries(
			Object.keys(solid.configs.typescript.rules).map((rule) => [
				rule,
				"off",
			])
		),
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint/*.js"] },
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// Plain JavaScript over untyped ESTree nodes: type-aware "unsafe any"
		// rules would flag every node access, and the rule's own tests cover it.
		files: ["eslint/**/*.js"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
	{
		files: ["src/**/*.{ts,tsx}"],
		ignores: ["src/shared/data/useQuery.ts", "src/**/*.test.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					...baseRestrictedImports,
					paths: [
						{
							name: "convex-solidjs",
							importNames: ["useQuery"],
							message:
								"Use useQuery from src/shared/data/useQuery.ts: it keeps the query warm after unmount.",
						},
					],
				},
			],
		},
	},
	{
		files: [
			"src/**/*.{ts,tsx}",
			"convex/**/*.ts",
			"emails/**/*.{ts,tsx}",
			"agreements/**/*.ts",
		],
		plugins: { neverthrow: neverthrowRules },
		rules: {
			"neverthrow/must-use-result": "error",
			"no-restricted-syntax": [
				"error",
				...baseRestrictedSyntax,
				NO_THROW,
				NO_MORPH_ATTRIBUTE,
			],
			"no-restricted-properties": [
				"error",
				...baseRestrictedProperties,
				{ property: "_unsafeUnwrap", message: UNSAFE_UNWRAP_MESSAGE },
				{
					property: "_unsafeUnwrapErr",
					message: UNSAFE_UNWRAP_MESSAGE,
				},
			],
		},
	},
	{
		files: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
		plugins: { boundaries },
		settings: {
			"import/resolver": { typescript: true },
			"boundaries/include": ["convex/**/*", "src/**/*"],
			"boundaries/ignore": ["src/**/*.test.{ts,tsx}"],
			"boundaries/elements": BOUNDARY_ELEMENTS,
			"boundaries/files": BOUNDARY_FILES,
		},
		rules: {
			"boundaries/dependencies": [
				"error",
				{
					default: "disallow",
					policies: BOUNDARY_POLICIES,
					checkUnknownLocals: true,
				},
			],
			// The dependencies rule skips a file that is in no element, so a
			// file outside every layer is reported here instead.
			"boundaries/no-unknown-files": "error",
		},
	},
	{
		files: ["src/**/*.{ts,tsx}"],
		plugins: { types: typeRules },
		rules: { "types/ambient-in-dts": "error" },
	},
	{
		files: ["convex/**/*.ts"],
		ignores: ["convex/**/*.test.ts"],
		plugins: { convex: convexRules },
		rules: { "convex/no-collect-in-mutation": "error" },
	},
	{
		// Email clients read no stylesheet: jsx-email templates style inline.
		files: ["emails/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-syntax": [
				"error",
				...baseRestrictedSyntax.filter(
					(entry) => !INLINE_STYLE_RESTRICTIONS.includes(entry)
				),
				NO_THROW,
			],
		},
	},
	{
		files: ["convex/lib/result.ts", "**/*.test.{ts,tsx}", "test-stubs/**"],
		// Tests build Results for mocks and await code under test for its side
		// effects; asserting on the outcome is their handling.
		rules: {
			"neverthrow/must-use-result": "off",
			"no-restricted-syntax": ["error", ...baseRestrictedSyntax],
			"no-restricted-properties": "off",
		},
	},
];
