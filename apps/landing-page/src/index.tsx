import { hydrate, render } from "solid-js/web";

import { Root } from "./Root.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

// Built pages arrive prerendered (see scripts/prerender.mjs), so the app takes
// over that markup. The dev server serves the bare template, so it renders.
if (root.firstElementChild) {
	hydrate(() => <Root />, root);
} else {
	render(() => <Root />, root);
}
