import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../types.ts";

export const communityModule: ModuleManifest = {
	id: "community",
	label: "Community",
	icon: ICONS.community,
	path: "/community",
	subject: "Community",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() =>
		import("./CommunityPage.tsx").then((m) => m.CommunityPage)
	),
};
