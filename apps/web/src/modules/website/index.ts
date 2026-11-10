import { api } from "../../../convex/_generated/api";
import { prefetch } from "../../shared/data/queryKeeper.ts";
import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../../shared/moduleManifest.ts";

import { DEFAULT_RANGE } from "./websiteView.ts";

export const websiteModule: ModuleManifest = {
	id: "website",
	label: "Website",
	icon: ICONS.website,
	path: "/website",
	subject: "Website",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() =>
		import("./WebsitePage.tsx").then((loaded) => loaded.WebsitePage)
	),
	prefetch: () => {
		prefetch(api.websiteAnalytics.snapshot, { days: DEFAULT_RANGE });
	},
};
