import { createHash } from "node:crypto";

import { err, ok, type Result } from "neverthrow";
import type { Plugin, Rollup } from "vite";

const IMPORT_MAP_CSP_FILE = ".importmap-csp";

const IMPORT_MAP_ASSET = "importmap.json";
const HTML_ASSET = "index.html";
const FIRST_MODULE_TAG = /<script\s+type="module"|<link\s+rel="modulepreload"/;

export function injectImportMap(
	html: string,
	importMapJson: string
): Result<{ html: string; cspSource: string }, string> {
	const match = FIRST_MODULE_TAG.exec(html);
	if (!match) return err("index.html has no module script or modulepreload");
	const hash = createHash("sha256").update(importMapJson).digest("base64");
	const tag = `<script type="importmap">${importMapJson}</script>`;
	return ok({
		html: html.slice(0, match.index) + tag + html.slice(match.index),
		cspSource: `'sha256-${hash}'`,
	});
}

function assetNamed(bundle: Rollup.OutputBundle, name: string) {
	const file = bundle[name] as Rollup.OutputBundle[string] | undefined;
	return file?.type === "asset" && typeof file.source === "string"
		? file
		: null;
}

/**
 * Moves Rolldown's chunk import map into index.html and writes its CSP hash
 * next to the build, so the web server can allow that one inline script.
 */
export function importMapPlugin(): Plugin {
	return {
		name: "j-os-import-map",
		apply: "build",
		enforce: "post",
		generateBundle(_, bundle) {
			const mapFile = assetNamed(bundle, IMPORT_MAP_ASSET);
			const pageFile = assetNamed(bundle, HTML_ASSET);
			if (mapFile === null) {
				this.error(`${IMPORT_MAP_ASSET} is missing from the bundle`);
			}
			if (pageFile === null) {
				this.error(`${HTML_ASSET} is missing from the bundle`);
			}
			const injected = injectImportMap(
				String(pageFile.source),
				String(mapFile.source)
			);
			if (injected.isErr()) this.error(injected.error);
			pageFile.source = injected.value.html;
			this.emitFile({
				type: "asset",
				fileName: IMPORT_MAP_CSP_FILE,
				source: injected.value.cspSource,
			});
			delete bundle["importmap.json"];
		},
	};
}
