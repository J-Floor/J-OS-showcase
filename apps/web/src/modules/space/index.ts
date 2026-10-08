import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../types.ts";

export const spaceModule: ModuleManifest = {
	id: "space",
	label: "Space",
	icon: ICONS.space,
	path: "/space",
	subject: "Space",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() => import("./SpacePage.tsx").then((m) => m.SpacePage)),
};
