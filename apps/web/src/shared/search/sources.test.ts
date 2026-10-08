// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { ICONS } from "../icons.ts";

import { COMMUNITY_TABS, INVENTORY_TABS } from "./sources.tsx";

type Tab = { tab: string; icon: string };

function icon(tabs: readonly Tab[], tab: string): string | undefined {
	return tabs.find((t) => t.tab === tab)?.icon;
}

test("palette sources use the shared icons for members, item types and categories", () => {
	expect(icon(COMMUNITY_TABS, "members")).toBe(ICONS.members);
	expect(icon(INVENTORY_TABS, "types")).toBe(ICONS.itemType);
	expect(icon(INVENTORY_TABS, "categories")).toBe(ICONS.category);
});
