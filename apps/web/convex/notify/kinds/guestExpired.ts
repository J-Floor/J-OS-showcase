import { v, type Infer } from "convex/values";

import { homeUrl, personUrl } from "../../emails/urls.ts";
import { defineKind, type Recipient } from "../types.ts";

import { guestAudience } from "./guestAudience.ts";
import { noticeEmail } from "./noticeEmail.ts";

const payload = v.object({ guestId: v.id("people"), guestName: v.string() });

function copy(
	details: Infer<typeof payload>,
	recipient: Recipient
): { title: string; body: string; url: string } {
	if (recipient.personId === details.guestId) {
		return {
			title: "Your guest access has ended",
			body: "Your guest access to the J floor has ended. Ask your host if you need more time.",
			url: homeUrl(),
		};
	}
	return {
		title: "Guest access ended",
		body: `${details.guestName}'s guest access has ended.`,
		url: personUrl(details.guestId),
	};
}

/** The one audience that keeps a non-entitled person: the guest whose window
 *  just closed is exactly who needs to hear it. */
export const guestExpired = defineKind({
	category: "guests",
	payload,
	audience: (context, { guestId }) =>
		guestAudience(context, guestId, { guest: "always" }),
	push: (details, recipient) => ({
		...copy(details, recipient),
		tag: `guest-${details.guestId}-expired`,
	}),
	email: (details, recipient) => {
		return noticeEmail(copy(details, recipient));
	},
});
