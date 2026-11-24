import { describe, expect, it } from "vitest";

// eslint-disable-next-line unicorn/name-replacements -- the exported name is the package contract
import { rewriteAssetRefs } from "./assetRefs.ts";

const MAP: Record<string, string> = {
	// Known to the resolver on purpose: only the traversal rule can refuse these.
	"assets/../slides/a.png": "data:image/png;base64,TRAV",
	"assets/a/../logo.png": "data:image/png;base64,TRAV",
	"assets/logo.png": "data:image/png;base64,AAA",
	"assets/fonts/m.woff2": "data:font/woff2;base64,BBB",
};
function resolve(path: string): string | undefined {
	return MAP[path];
}

describe("rewriteAssetRefs", () => {
	it("rewrites src, href and CSS url() forms", () => {
		const html = `<img src="assets/logo.png"><img src='./assets/logo.png'><link href="assets/logo.png"><style>@font-face{src:url(assets/fonts/m.woff2)} .x{background:url("assets/logo.png")} .y{background:url( './assets/logo.png' )}</style>`;
		expect(rewriteAssetRefs(html, resolve)).toBe(
			`<img src="data:image/png;base64,AAA"><img src='data:image/png;base64,AAA'><link href="data:image/png;base64,AAA"><style>@font-face{src:url(data:font/woff2;base64,BBB)} .x{background:url("data:image/png;base64,AAA")} .y{background:url( 'data:image/png;base64,AAA' )}</style>`
		);
	});

	it("leaves unknown and absolute references alone", () => {
		const html = `<img src="assets/missing.png"><img src="https://example.com/assets/logo.png"><img src="/assets/logo.png">`;
		expect(rewriteAssetRefs(html, resolve)).toBe(html);
	});

	it("refuses a traversing path even when the resolver knows it", () => {
		const html = `<img src="assets/../slides/a.png"><img src="assets/a/../logo.png"><div style="background:url(assets/../slides/a.png)">`;
		expect(rewriteAssetRefs(html, resolve)).toBe(html);
	});

	it("matches attribute and function names in any letter case", () => {
		expect(
			rewriteAssetRefs(
				`<IMG SRC="assets/logo.png"><a HREF='assets/logo.png'><style>.x{background:URL(assets/logo.png)}</style>`,
				resolve
			)
		).toBe(
			`<IMG SRC="data:image/png;base64,AAA"><a HREF='data:image/png;base64,AAA'><style>.x{background:URL(data:image/png;base64,AAA)}</style>`
		);
	});

	it("rewrites unquoted attribute values and poster", () => {
		expect(
			rewriteAssetRefs(
				`<img src=assets/logo.png alt=x><video poster=assets/logo.png></video>`,
				resolve
			)
		).toBe(
			`<img src=data:image/png;base64,AAA alt=x><video poster=data:image/png;base64,AAA></video>`
		);
	});

	it("drops a ?query or #fragment so a data: URI stays valid", () => {
		const out = rewriteAssetRefs(
			`<img src="assets/logo.png?v=2"><img src="assets/logo.png#top"><style>a{background:url(assets/logo.png?x=1)}</style><img src="assets/missing.png?v=2">`,
			resolve
		);
		expect(out).toBe(
			`<img src="data:image/png;base64,AAA"><img src="data:image/png;base64,AAA"><style>a{background:url(data:image/png;base64,AAA)}</style><img src="assets/missing.png?v=2">`
		);
	});

	it("rewrites each candidate of a srcset", () => {
		expect(
			rewriteAssetRefs(
				`<img SRCSET="assets/logo.png 1x, ./assets/fonts/m.woff2 2x, https://example.com/x.png 3x">`,
				resolve
			)
		).toBe(
			`<img SRCSET="data:image/png;base64,AAA 1x, data:font/woff2;base64,BBB 2x, https://example.com/x.png 3x">`
		);
	});

	it("rewrites CSS @import of an asset", () => {
		expect(
			rewriteAssetRefs(
				`@import "assets/logo.png"; @IMPORT 'assets/logo.png';`,
				resolve
			)
		).toBe(
			`@import "data:image/png;base64,AAA"; @IMPORT 'data:image/png;base64,AAA';`
		);
	});

	it("rewrites CSS urls quoted with entities inside a style attribute", () => {
		expect(
			rewriteAssetRefs(
				`<div style="background:url(&quot;assets/logo.png&quot;)"></div><div style='background:url(&#39;assets/logo.png?v=1&#39;)'></div><div style="background:url(&#x27;assets/logo.png&#x27;)"></div><div style="background:url(&quot;assets/missing.png&quot;)"></div>`,
				resolve
			)
		).toBe(
			`<div style="background:url(&quot;data:image/png;base64,AAA&quot;)"></div><div style='background:url(&#39;data:image/png;base64,AAA&#39;)'></div><div style="background:url(&#x27;data:image/png;base64,AAA&#x27;)"></div><div style="background:url(&quot;assets/missing.png&quot;)"></div>`
		);
	});

	it("drops a query that contains a space when the reference is quoted, and keeps what follows an unquoted one", () => {
		expect(
			rewriteAssetRefs(
				`<img src="assets/logo.png?a=1 b=2" alt="x"><img src=assets/logo.png?v=1 alt=y>`,
				resolve
			)
		).toBe(
			`<img src="data:image/png;base64,AAA" alt="x"><img src=data:image/png;base64,AAA alt=y>`
		);
	});

	it("matches a srcset path in any letter case of the folder name", () => {
		expect(
			rewriteAssetRefs(`<img srcset="ASSETS/logo.png 1x">`, (path) =>
				// eslint-disable-next-line no-restricted-syntax -- a path is looked up, not shown
				resolve(path.toLowerCase())
			)
		).toBe(`<img srcset="data:image/png;base64,AAA 1x">`);
	});

	// This test can only fail by hanging or by being slow: a catastrophic regex
	// never returns, and vitest's own timeout cannot interrupt a synchronous
	// loop. A hang here means a backtracking regression in assetRefs.ts.
	it("runs in linear time on hostile input", { timeout: 30_000 }, () => {
		const size = 400_000;
		const inputs = [
			"src" + " ".repeat(size),
			"src=".repeat(size / 4),
			"url(".repeat(size / 4),
			"url(" + " ".repeat(size),
			'srcset="'.repeat(size / 8),
			'srcset="' + "a ".repeat(size / 2),
			"@import" + " ".repeat(size),
			"src=assets/" + "a".repeat(size),
			"src=assets/a.png?" + "?".repeat(size),
			'src="assets/a?'.repeat(size / 14),
			"url(&quot;assets/a?".repeat(size / 19),
		];
		const start = performance.now();
		for (const input of inputs) rewriteAssetRefs(input, resolve);
		// Linear work takes a few hundred ms here, more on a slow CI runner; a
		// backtracking regex takes minutes, so a generous budget still catches it.
		expect(performance.now() - start).toBeLessThan(15_000);
	});
});
