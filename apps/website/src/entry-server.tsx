import { generateHydrationScript, renderToString } from "solid-js/web";

import { App } from "./App.tsx";
import { pageMeta, site } from "./site.ts";
export function render(path: string, now: number) {
	const meta = pageMeta(path);
	const canonical =
		path === "/404"
			? ""
			: `<link rel="canonical" href="${site.origin}${path}">`;
	return {
		html: renderToString(() => <App path={path} now={now} />),
		head: `${generateHydrationScript()}<title>${meta.title}</title><meta name="description" content="${meta.description}"><meta property="og:title" content="${meta.title}"><meta property="og:description" content="${meta.description}"><meta property="og:type" content="website">${canonical}${path === "/404" ? '<meta name="robots" content="noindex">' : ""}`,
	};
}
