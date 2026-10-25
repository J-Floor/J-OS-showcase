import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * The overlay contract, read off the source: every modal overlay goes
 * through the overlay layer (utils/overlayLayer.tsx), which opens it through
 * a morph and marks its scrim and title, and each overlay's stylesheet turns
 * its own pop-in off while a morph runs. Each rule is derived from what a
 * file does, so a new overlay is checked without being listed.
 */

const SOURCE_ROOT = import.meta.dirname;
const OVERLAY_LAYER = "utils/overlayLayer.tsx";
const SCRIPT = /\.tsx?$/;
const TEST_FILE = /\.test(?:-d)?\.tsx?$/;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const PRESENCE_CALL = /(?<!function )\bcreateMorphPresence\(/;
/** An import of Ark's Dialog, by name or alias. */
const ARK_DIALOG_IMPORT =
	/import\s*\{([^}]*)\}\s*from\s*["']@ark-ui\/solid(?:\/dialog)?["']/g;
const NAMED_DIALOG = /(?:^|,)\s*Dialog(?:\s+as\s+(\w+))?\s*(?=,|$)/;
const ARK_NAMESPACE_IMPORT =
	/import\s*\*\s*as\s+(\w+)\s+from\s*["']@ark-ui\/solid(?:\/dialog)?["']/g;
const RENDERS_OVERLAY_ROOT = /<OverlayRoot\b/;
const STYLES_IMPORT =
	/import\s+styles\s+from\s+["'](\.\/[^"']+\.module\.scss)["']/;
const MORPH_OFF = 'data-vt~="morph"';

type SourceFile = { path: string; source: string };

/** `source` without its comments: prose that names a call is not one. */
function code(source: string): string {
	return source.replaceAll(COMMENT, "");
}

function sourceFiles(): SourceFile[] {
	return readdirSync(SOURCE_ROOT, { recursive: true, encoding: "utf8" })
		.filter((path) => SCRIPT.test(path) && !TEST_FILE.test(path))
		.map((path) => ({
			path,
			source: readFileSync(join(SOURCE_ROOT, path), "utf8"),
		}));
}

/** Whether `file` opens an overlay through a morph itself. */
function callsPresence(file: SourceFile): boolean {
	return PRESENCE_CALL.test(code(file.source));
}

/** The names `file` binds Ark's Dialog to. */
function arkDialogNames(source: string): string[] {
	const named = [...source.matchAll(ARK_DIALOG_IMPORT)].flatMap((match) => {
		const binding = NAMED_DIALOG.exec(match[1]);
		const alias: string | undefined = binding?.[1];
		return binding ? [alias ?? "Dialog"] : [];
	});
	const namespaces = [...source.matchAll(ARK_NAMESPACE_IMPORT)].map(
		(match) => `${match[1]}.Dialog`
	);
	return [...named, ...namespaces];
}

/** Whether `file` renders Ark's dialog root itself. */
function rendersArkDialogRoot(file: SourceFile): boolean {
	const source = code(file.source);
	return arkDialogNames(source).some((name) =>
		new RegExp(`<${name.replaceAll(".", "\\.")}\\.Root\\b`).test(source)
	);
}

/** The stylesheet `file` imports as `styles`, if it renders an overlay root:
 *  `null` when it renders one without a stylesheet. */
function overlayStylesheet(file: SourceFile): string | null | undefined {
	const source = code(file.source);
	if (!RENDERS_OVERLAY_ROOT.test(source)) return undefined;
	const imported = STYLES_IMPORT.exec(source)?.[1];
	return imported ? join(dirname(file.path), imported) : null;
}

describe("the rules", () => {
	const caller = {
		path: "components/Thing/Thing.tsx",
		source: "const presence = createMorphPresence({ open });",
	};
	const definition = {
		path: "utils/morphPresence.ts",
		source: "export function createMorphPresence(options) {}",
	};
	const prose = {
		path: "components/Thing/Thing.tsx",
		source: "/* opens through `createMorphPresence(…)` */",
	};

	test("a call counts, its definition and prose do not", () => {
		expect(callsPresence(caller)).toBe(true);
		expect(callsPresence(definition)).toBe(false);
		expect(callsPresence(prose)).toBe(false);
	});

	test("Ark's dialog root counts by any name; the design system's does not", () => {
		const aliased = {
			path: "components/Thing/Thing.tsx",
			source: 'import { Dialog as ArkDialog } from "@ark-ui/solid";\n<ArkDialog.Root open={open()}>',
		};
		const subpath = {
			path: "components/Thing/Thing.tsx",
			source: 'import { Portal, Dialog } from "@ark-ui/solid/dialog";\n<Dialog.Root>',
		};
		const namespace = {
			path: "components/Thing/Thing.tsx",
			source: 'import * as Ark from "@ark-ui/solid";\n<Ark.Dialog.Root>',
		};
		const ownParts = {
			path: "components/Thing/Thing.tsx",
			source: 'import { Dialog } from "@ark-ui/solid/dialog";\n<Dialog.Positioner>',
		};
		const designSystem = {
			path: "components/Thing/Thing.tsx",
			source: 'import { Dialog } from "../Dialog/Dialog.tsx";\n<Dialog.Root>',
		};
		expect(rendersArkDialogRoot(aliased)).toBe(true);
		expect(rendersArkDialogRoot(subpath)).toBe(true);
		expect(rendersArkDialogRoot(namespace)).toBe(true);
		expect(rendersArkDialogRoot(ownParts)).toBe(false);
		expect(rendersArkDialogRoot(designSystem)).toBe(false);
	});

	test("an overlay root's stylesheet is the one it imports", () => {
		expect(
			overlayStylesheet({
				path: "components/Thing/Thing.tsx",
				source: 'import styles from "./Thing.module.scss";\n<OverlayRoot open>',
			})
		).toBe(join("components/Thing", "Thing.module.scss"));
		expect(
			overlayStylesheet({
				path: "components/Thing/Thing.tsx",
				source: "<OverlayRoot open>",
			})
		).toBeNull();
		expect(
			overlayStylesheet({
				path: "components/Thing/Thing.tsx",
				source: "",
			})
		).toBeUndefined();
	});
});

describe("the overlay contract", () => {
	const files = sourceFiles();

	test("only the overlay layer opens an overlay through a morph", () => {
		expect(
			files.filter((file) => callsPresence(file)).map((file) => file.path)
		).toEqual([OVERLAY_LAYER]);
	});

	test("the overlay layer marks the scrim and the title", () => {
		const layer = files.find((file) => file.path === OVERLAY_LAYER);
		expect(code(layer?.source ?? "")).toMatch(/\bMORPH_SCRIM\b/);
		expect(code(layer?.source ?? "")).toMatch(/\bMORPH_TITLE\b/);
	});

	test("outside utils/, no file renders Ark's dialog root itself", () => {
		const offenders = files
			.filter((file) => !file.path.startsWith("utils/"))
			.filter((file) => rendersArkDialogRoot(file))
			.map((file) => file.path);
		expect(offenders).toEqual([]);
	});

	test("every overlay turns its own pop-in off while a morph runs", () => {
		const overlays = files.flatMap((file) => {
			const stylesheet = overlayStylesheet(file);
			return stylesheet === undefined ? [] : [{ file, stylesheet }];
		});
		expect(overlays.length).toBeGreaterThan(0);
		const missing = overlays
			.filter(
				({ stylesheet }) =>
					stylesheet === null ||
					!readFileSync(
						join(SOURCE_ROOT, stylesheet),
						"utf8"
					).includes(MORPH_OFF)
			)
			.map(({ file }) => file.path);
		expect(missing).toEqual([]);
	});
});
