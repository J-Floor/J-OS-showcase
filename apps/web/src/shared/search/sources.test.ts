// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { ROSTER_TABS } from "../../modules/community/communityTabs.ts";
import { INVENTORY_TABS } from "../../modules/inventory/inventoryTabs.ts";
import { ICONS } from "../icons.ts";

type Tab = { tab: string; icon: string };

function icon(tabs: readonly Tab[], tab: string): string | undefined {
	return tabs.find((entry) => entry.tab === tab)?.icon;
}

test("palette sources use the shared icons for members, item types and categories", () => {
	expect(icon(ROSTER_TABS, "members")).toBe(ICONS.members);
	expect(icon(INVENTORY_TABS, "types")).toBe(ICONS.itemType);
	expect(icon(INVENTORY_TABS, "categories")).toBe(ICONS.category);
});
