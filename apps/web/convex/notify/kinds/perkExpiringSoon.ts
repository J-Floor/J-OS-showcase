import { v } from "convex/values";

import { perkUrl } from "../../emails/urls.ts";
import { formatDateOnlyLong, isoToUtcMidnight } from "../../lib/time.ts";
import { communityIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/** "9 November 2026" from the stored `YYYY-MM-DD`. */
function endDate(validUntil: string): string {
	return formatDateOnlyLong(isoToUtcMidnight(validUntil));
}

/** A perk's last valid day is a week away (`notify/perkReminders`). Everyone
 *  who can view Perks hears about it. */
export const perkExpiringSoon = defineKind({
	category: "perkUpdates",
	delivery: "digest",
	payload: v.object({
		perkId: v.id("perks"),
		perkTitle: v.string(),
		/** The perk's last valid day, `YYYY-MM-DD` (inclusive). */
		validUntil: v.string(),
	}),
	audience: (context) => communityIds(context),
	push: ({ perkId, perkTitle, validUntil }) => ({
		title: "Perk ending soon",
		body: `${perkTitle} ends on ${endDate(validUntil)}`,
		url: perkUrl(perkId),
		tag: `perk-${perkId}-expiring`,
	}),
});
