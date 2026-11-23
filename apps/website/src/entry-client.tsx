import { hydrate, render } from "solid-js/web";

import { App } from "./App.tsx";
const root = document.getElementById("root");
if (root)
	(root.dataset.renderedAt ? hydrate : render)(
		() => (
			<App
				path={location.pathname.replace(/\/$/, "") || "/"}
				now={Number(root.dataset.renderedAt) || Date.now()}
			/>
		),
		root
	);
