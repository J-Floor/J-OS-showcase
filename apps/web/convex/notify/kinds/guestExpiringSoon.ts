import { v, type Infer } from "convex/values";

import { personUrl, spaceUrl } from "../../emails/urls.ts";
import { defineKind, type Recipient } from "../types.ts";

import { guestAudience } from "./guestAudience.ts";
import { noticeEmail } from "./noticeEmail.ts";

const payload = v.object({
	guestId: v.id("people"),
	guestName: v.string(),
	untilDate: v.string(),
});

function copy(
	details: Infer<typeof payload>,
	recipient: Recipient
): { title: string; body: string; url: string } {
	if (recipient.personId === details.guestId) {
		return {
			title: "Your guest access ends soon",
			body: `Your guest access ends on ${details.untilDate}.`,
			url: spaceUrl(),
		};
	}
	return {
		title: "Guest access ending soon",
		body: `${details.guestName}'s guest access ends on ${details.untilDate}.`,
		url: personUrl(details.guestId),
	};
}

export const guestExpiringSoon = defineKind({
	category: "guests",
	payload,
	audience: (context, { guestId }) =>
		guestAudience(context, guestId, { guest: "entitled" }),
	push: (details, recipient) => ({
		...copy(details, recipient),
		tag: `guest-${details.guestId}-expiring`,
	}),
	email: (details, recipient) => {
		return noticeEmail(copy(details, recipient));
	},
});
