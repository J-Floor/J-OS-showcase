import { v } from "convex/values";

import { perkRequestUrl } from "../../emails/urls.ts";
import { isActiveContact } from "../../lib/perks.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

const payload = v.object({
	requestId: v.id("perkRequests"),
	perkId: v.id("perks"),
	contactId: v.optional(v.id("people")),
	perkTitle: v.string(),
	partner: v.string(),
	requesterName: v.string(),
});

/** Someone asked for a perk. The push names who and what. The requester's contact details and note stay out of the payload. */
export const perkRequested = defineKind({
	category: "perks",
	delivery: "digest",
	payload,
	// The contact while `isActiveContact` says they can act on it. A contact
	// who was erased, demoted or whose window closed falls back to the whole
	// board, so a request never goes unheard.
	audience: async (context, { contactId }) => {
		const now = Date.now();
		const contact = contactId ? await context.db.get(contactId) : null;
		return isActiveContact(contact, now)
			? [contact._id]
			: boardIds(context, now);
	},
	push: ({ requestId, perkTitle, partner, requesterName }) => ({
		title: "Perk requested",
		body: `${requesterName} requested ${perkTitle} (${partner})`,
		url: perkRequestUrl(requestId),
		tag: `perk-request-${requestId}`,
	}),
});
