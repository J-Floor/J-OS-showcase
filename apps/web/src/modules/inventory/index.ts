import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../types.ts";

export const inventoryModule: ModuleManifest = {
	id: "inventory",
	label: "Inventory",
	icon: ICONS.inventory,
	path: "/inventory",
	subject: "Inventory",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() =>
		import("./InventoryPage.tsx").then((m) => m.InventoryPage)
	),
};
