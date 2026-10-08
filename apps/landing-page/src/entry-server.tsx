import { generateHydrationScript, renderToString } from "solid-js/web";

import { Root } from "./Root.tsx";

/** Build-time only: render one route to HTML for scripts/prerender.mjs. */
export function renderRoute(url: string): { html: string; head: string } {
	return {
		html: renderToString(() => <Root url={url} />),
		head: generateHydrationScript(),
	};
}
