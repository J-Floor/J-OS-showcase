import { v, type Infer } from "convex/values";

import { perkRequested as perkRequestedEmail } from "../../emails/generated/perkRequested.ts";
import {
	emailUrls,
	manageNotificationsUrl,
	perkRequestUrl,
} from "../../emails/urls.ts";
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
	requesterEmail: v.string(),
	ventureName: v.optional(v.string()),
	note: v.optional(v.string()),
});

const CONTACT_REASON = "You're the contact for this perk.";
const BOARD_REASON =
	"The perk has no active contact, so this goes to the whole board.";

/** "Ada Lovelace (ada@example.com, Acme)"; no venture part when there is none. */
function requesterLine({
	requesterName,
	requesterEmail,
	ventureName,
}: Infer<typeof payload>): string {
	const reach = ventureName
		? `${requesterEmail}, ${ventureName}`
		: requesterEmail;
	return `${requesterName} (${reach})`;
}

/**
 * Someone asked for a perk. The note is the member's own words: it goes in
 * the email body only, never in the subject or on a lock screen.
 */
export const perkRequested = defineKind({
	category: "perks",
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
	email: (details, recipient) => {
		const { html, text } = perkRequestedEmail({
			name: recipient.firstName,
			requester: requesterLine(details),
			perkTitle: details.perkTitle,
			partner: details.partner,
			// The audience's decision, read back: the contact is a recipient
			// only when `isActiveContact` chose them (`boardIds` never lists a
			// contact who failed it), so everyone else is the fallback board.
			reason:
				recipient.personId === details.contactId
					? CONTACT_REASON
					: BOARD_REASON,
			note: details.note ? [{ text: details.note }] : [],
			viewUrl: perkRequestUrl(details.requestId),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return {
			subject: `${details.requesterName} requested a perk: ${details.perkTitle}`,
			html,
			text,
		};
	},
});
