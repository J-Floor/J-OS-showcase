import { ICONS } from "../../shared/icons.ts";

/** The three rosters. They are destinations in their own right ("the guests
 *  list" is a thing people look for by name), so the command palette lists
 *  them too. */
export const ROSTER_TABS = [
	{
		tab: "applications",
		label: "Applications",
		icon: ICONS.memberApplication,
	},
	{ tab: "members", label: "Members", icon: ICONS.members },
	{ tab: "guests", label: "Guests", icon: ICONS.guestApplication },
] as const;

/**
 * The board console's tabs: each one's `?tab=` key and label.
 *
 * Insights after the rosters: they are what the board opens this page to do,
 * and a dashboard in front of them would put a read-only tab between them and
 * the work. It is also the only tab with no sheet, which is why it is not
 * handed the person `selection`. My profile sits after it: the board's own
 * row, not part of the triage work, and likewise sheetless.
 */
export const COMMUNITY_TABS = [
	...ROSTER_TABS,
	{ tab: "insights", label: "Insights" },
	{ tab: "profile", label: "My profile" },
] as const;

export type CommunityTabKey = (typeof COMMUNITY_TABS)[number]["tab"];

/** The `?tab=` names, in tab order. */
export const COMMUNITY_TAB_KEYS: readonly CommunityTabKey[] =
	COMMUNITY_TABS.map((entry) => entry.tab);
