import { v } from "convex/values";

import { perkExpiringSoon as perkExpiringSoonEmail } from "../../emails/generated/perkExpiringSoon.ts";
import {
	emailUrls,
	manageNotificationsUrl,
	perkUrl,
} from "../../emails/urls.ts";
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
	payload: v.object({
		perkId: v.id("perks"),
		partner: v.string(),
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
	email: ({ perkId, partner, perkTitle, validUntil }, recipient) => {
		const { html, text } = perkExpiringSoonEmail({
			name: recipient.firstName,
			perkTitle,
			partner,
			endDate: endDate(validUntil),
			viewUrl: perkUrl(perkId),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return {
			subject: `${perkTitle} ends on ${endDate(validUntil)}`,
			html,
			text,
		};
	},
});
