import { v, type Infer, type VOptional } from "convex/values";

import type { Tier } from "../lib/lifecycleTypes.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS, CORE_AND_BOARD } from "../lib/roles.ts";

/**
 * What a person can switch on or off, per channel. Kinds belong to exactly one
 * category; preferences are stored per category, never per kind, so the
 * settings grid stays one row per topic a person recognises.
 */
export const CATEGORIES = [
	"events",
	"applications",
	"doors",
	"guests",
	"tasks",
	"perks",
	"perkUpdates",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const categoryValidator = v.union(
	...CATEGORIES.map((category) => v.literal(category))
);

const channelPref = v.object({ push: v.boolean(), email: v.boolean() });
export type ChannelPref = Infer<typeof channelPref>;

/** `people.notificationPrefs`. A missing category means {@link DEFAULT_PREF}. */
export const notificationPrefsValidator = v.object(
	Object.fromEntries(
		CATEGORIES.map((category) => [category, v.optional(channelPref)])
	) as Record<Category, VOptional<typeof channelPref>>
);
export type NotificationPrefs = Infer<typeof notificationPrefsValidator>;

const DEFAULT_PREF: ChannelPref = { push: true, email: true };

export type CategoryInfo = {
	label: string;
	description: string;
	/** Tiers that can receive this category, which is the set the settings
	 *  sheet shows it to. */
	tiers: readonly Tier[];
	/** Shown under the row, e.g. which reminder has no email side. */
	note?: string;
	/** No email side: `prefs.set` stores `email: false` for it. */
	pushOnly?: true;
};

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
	events: {
		label: "Events",
		description: "Reminders before an event starts and before it ends.",
		tiers: COMMUNITY_TIERS,
		note: "Event reminders are push only.",
		pushOnly: true,
	},
	applications: {
		label: "Applications",
		description: "A new application is waiting for review.",
		tiers: BOARD_LEVEL,
		note: "New applications are emailed as one daily summary.",
	},
	doors: {
		label: "Doors",
		description:
			"A lock goes offline, comes back online, or nears its key limit.",
		tiers: BOARD_LEVEL,
	},
	guests: {
		label: "Guests",
		description:
			"A guest's access is about to end, has ended, or has changed.",
		tiers: ["guest", ...BOARD_LEVEL],
	},
	tasks: {
		label: "Tasks",
		description: "You are assigned a task or made lead of a project.",
		tiers: CORE_AND_BOARD,
		note: "Emails come as one daily summary.",
	},
	// Key kept from when it was the only perk category: stored preferences
	// use it. Relabelled so the board can tell it from `perkUpdates`.
	perks: {
		label: "Perk requests",
		description: "Someone requests a perk you're the contact for.",
		tiers: BOARD_LEVEL,
		note: "Requests are emailed as one daily summary.",
	},
	perkUpdates: {
		label: "Perks",
		description:
			"A perk is added, your request is answered, or a perk ends in a week.",
		tiers: COMMUNITY_TIERS,
		note: "New and ending perks are emailed as one daily summary.",
	},
};

export function prefFor(
	prefs: NotificationPrefs | undefined,
	category: Category
): ChannelPref {
	return prefs?.[category] ?? DEFAULT_PREF;
}

export function categoriesForTier(tier: Tier): Category[] {
	return CATEGORIES.filter((category) =>
		CATEGORY_INFO[category].tiers.includes(tier)
	);
}
