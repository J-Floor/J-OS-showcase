import { ICONS } from "../../shared/icons.ts";

/** The inventory page's tabs: each one's `?tab=` key, label and icon. The tab
 *  bar, the URL selections and the command palette all map over this. */
export const INVENTORY_TABS = [
	{ tab: "items", label: "Items", icon: ICONS.inventory },
	{ tab: "types", label: "Item types", icon: ICONS.itemType },
	{ tab: "categories", label: "Categories", icon: ICONS.category },
] as const;

export type InventoryTabKey = (typeof INVENTORY_TABS)[number]["tab"];

/** The `?tab=` names, in tab order. */
export const INVENTORY_TAB_KEYS: readonly InventoryTabKey[] =
	INVENTORY_TABS.map((entry) => entry.tab);
