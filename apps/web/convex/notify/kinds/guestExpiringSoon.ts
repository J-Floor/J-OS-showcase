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
	p: Infer<typeof payload>,
	r: Recipient
): { title: string; body: string; url: string } {
	if (r.personId === p.guestId) {
		return {
			title: "Your guest access ends soon",
			body: `Your guest access ends on ${p.untilDate}.`,
			url: spaceUrl(),
		};
	}
	return {
		title: "Guest access ending soon",
		body: `${p.guestName}'s guest access ends on ${p.untilDate}.`,
		url: personUrl(p.guestId),
	};
}

export const guestExpiringSoon = defineKind({
	category: "guests",
	payload,
	audience: (ctx, { guestId }) =>
		guestAudience(ctx, guestId, { guest: "entitled" }),
	push: (p, r) => ({ ...copy(p, r), tag: `guest-${p.guestId}-expiring` }),
	email: (p, r) => {
		return noticeEmail(copy(p, r));
	},
});
