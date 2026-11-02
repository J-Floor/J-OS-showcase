// @vitest-environment node
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { injectImportMap } from "./importMap.ts";

const MAP = '{"imports":{"a":"/assets/a-123.js"}}';
const TAG = `<script type="importmap">${MAP}</script>`;

const withModuleScript =
	'<head><meta charset="UTF-8" /><script type="module" crossorigin src="/assets/index-1.js"></script>' +
	'<link rel="modulepreload" href="/assets/x.js"></head>';
const withPreloadFirst =
	'<head><meta charset="UTF-8" /><link rel="modulepreload" crossorigin href="/assets/x.js">' +
	'<script type="module" src="/assets/index-1.js"></script></head>';

describe("injectImportMap", () => {
	it("inserts the map after meta charset and before the first module script", () => {
		const result = injectImportMap(withModuleScript, MAP)._unsafeUnwrap();
		const charset = result.html.indexOf('<meta charset="UTF-8" />');
		expect(result.html.indexOf(TAG)).toBeGreaterThan(charset);
		expect(result.html).toContain(`${TAG}<script type="module"`);
	});

	it("inserts the map before a modulepreload that comes first", () => {
		const result = injectImportMap(withPreloadFirst, MAP)._unsafeUnwrap();
		expect(result.html).toContain(`${TAG}<link rel="modulepreload"`);
		expect(result.html.indexOf(TAG)).toBeLessThan(
			result.html.indexOf('<script type="module"')
		);
	});

	it("returns the sha256 of the exact inserted text", () => {
		const { cspSource, html } = injectImportMap(
			withModuleScript,
			MAP
		)._unsafeUnwrap();
		const inserted = html.slice(
			html.indexOf(">", html.indexOf('<script type="importmap"')) + 1,
			html.indexOf("</script>", html.indexOf('<script type="importmap"'))
		);
		const expected = createHash("sha256").update(inserted).digest("base64");
		expect(cspSource).toBe(`'sha256-${expected}'`);
	});

	it("errors when the page has no module script or modulepreload", () => {
		expect(injectImportMap("<head></head>", MAP).isErr()).toBe(true);
	});
});
