import { generateHydrationScript, renderToString } from "solid-js/web";

import { App } from "./App.tsx";
import { pageMeta, site } from "./site.ts";
export function render(path: string, now: number) {
	const meta = pageMeta(path);
	const isStub = path === "/404" || path === "/window";
	const canonical = isStub
		? ""
		: `<link rel="canonical" href="${site.origin}${path}">`;
	return {
		html: renderToString(() => <App path={path} now={now} />),
		head: `${generateHydrationScript()}<title>${meta.title}</title><meta name="description" content="${meta.description}"><meta property="og:title" content="${meta.title}"><meta property="og:description" content="${meta.description}"><meta property="og:type" content="website">${canonical}${isStub ? '<meta name="robots" content="noindex">' : ""}`,
	};
}
