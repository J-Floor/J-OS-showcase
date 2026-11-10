import { v } from "convex/values";

import { perkRequestOutcome as perkRequestOutcomeEmail } from "../../emails/generated/perkRequestOutcome.ts";
import {
	emailUrls,
	manageNotificationsUrl,
	perkUrl,
} from "../../emails/urls.ts";
import { ANSWER_STATUSES, type PerkRequestAnswer } from "../../lib/perks.ts";
import { isCommunityTier } from "../../lib/roles.ts";
import { entitledIds } from "../audience.ts";
import { defineKind } from "../types.ts";

const HEADLINES: Record<PerkRequestAnswer, string> = {
	granted: "Perk request granted",
	declined: "Perk request declined",
};

/** The board moved someone's request to Granted or Declined. Only the
 *  requester hears, and nothing from their note goes anywhere. */
export const perkRequestOutcome = defineKind({
	category: "perkUpdates",
	delivery: "instant",
	payload: v.object({
		requestId: v.id("perkRequests"),
		perkId: v.id("perks"),
		personId: v.id("people"),
		partner: v.string(),
		perkTitle: v.string(),
		outcome: v.union(...ANSWER_STATUSES.map((answer) => v.literal(answer))),
	}),
	// The requester while they can still view Perks: entitled and in a
	// community tier (a requester since made staff hears nothing).
	audience: async (context, { personId }) => {
		const person = await context.db.get(personId);
		return person && isCommunityTier(person.tier)
			? entitledIds(context, [personId])
			: [];
	},
	push: ({ requestId, perkId, perkTitle, outcome }) => ({
		title: HEADLINES[outcome],
		body: `Your request for ${perkTitle} was ${outcome}`,
		url: perkUrl(perkId),
		// One per request: a later answer replaces the earlier one on the
		// device.
		tag: `perk-request-${requestId}-outcome`,
	}),
	email: ({ perkId, partner, perkTitle, outcome }, recipient) => {
		const { html, text } = perkRequestOutcomeEmail({
			name: recipient.firstName,
			headline: HEADLINES[outcome],
			perkTitle,
			partner,
			outcome,
			viewUrl: perkUrl(perkId),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return {
			subject: `Your request for ${perkTitle} was ${outcome}`,
			html,
			text,
		};
	},
});
