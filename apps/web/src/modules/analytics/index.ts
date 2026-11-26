import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../../shared/moduleManifest.ts";

export const analyticsModule: ModuleManifest = {
	id: "analytics",
	label: "Analytics",
	icon: ICONS.analytics,
	path: "/analytics",
	subject: "Analytics",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() =>
		import("./AnalyticsPage.tsx").then((loaded) => loaded.AnalyticsPage)
	),
};
