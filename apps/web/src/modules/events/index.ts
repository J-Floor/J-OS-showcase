import { api } from "../../../convex/_generated/api";
import { prefetch } from "../../shared/data/queryKeeper.ts";
import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../types.ts";

export const eventsModule: ModuleManifest = {
	id: "events",
	label: "Events",
	icon: ICONS.events,
	path: "/events",
	subject: "Events",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() => import("./EventsPage.tsx").then((m) => m.EventsPage)),
	prefetch: () => {
		prefetch(api.events.listEvents, {});
	},
};
