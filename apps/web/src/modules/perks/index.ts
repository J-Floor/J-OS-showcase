import { api } from "../../../convex/_generated/api";
import { prefetch } from "../../shared/data/queryKeeper.ts";
import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../../shared/moduleManifest.ts";

export const perksModule: ModuleManifest = {
	id: "perks",
	label: "Perks",
	icon: ICONS.perks,
	path: "/perks",
	subject: "Perks",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() =>
		import("./PerksPage.tsx").then((loaded) => loaded.PerksPage)
	),
	prefetch: () => {
		prefetch(api.perks.listPerks, {});
		// The list's rows wait on it (an expired perk stays listed while the
		// viewer's request on it is open), and the sheet's Request button
		// reads it on every perk.
		prefetch(api.perkRequests.myOpenPerkRequests, {});
	},
};
