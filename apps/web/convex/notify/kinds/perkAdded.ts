import { v } from "convex/values";

import { perkUrl } from "../../emails/urls.ts";
import { communityIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/** The board added a perk that has not already ended. Everyone who can view
 *  Perks (the community tiers, as `listPerks` gates) hears about it, except
 *  the board member who added it. A payload without `addedBy` (the one-off
 *  announcement of existing perks) leaves nobody out. */
export const perkAdded = defineKind({
	category: "perkUpdates",
	delivery: "digest",
	payload: v.object({
		perkId: v.id("perks"),
		partner: v.string(),
		perkTitle: v.string(),
		addedBy: v.optional(v.id("people")),
	}),
	audience: async (context, { addedBy }) => {
		const community = await communityIds(context);
		return addedBy === undefined
			? community
			: community.filter((id) => id !== addedBy);
	},
	push: ({ perkId, partner, perkTitle }) => ({
		title: "New perk",
		body: `${partner} · ${perkTitle}`,
		url: perkUrl(perkId),
		tag: `perk-${perkId}-added`,
	}),
});
