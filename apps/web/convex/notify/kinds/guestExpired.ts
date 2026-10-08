import { v, type Infer } from "convex/values";

import { homeUrl, personUrl } from "../../emails/urls.ts";
import { defineKind, type Recipient } from "../types.ts";

import { guestAudience } from "./guestAudience.ts";
import { noticeEmail } from "./noticeEmail.ts";

const payload = v.object({ guestId: v.id("people"), guestName: v.string() });

function copy(
	p: Infer<typeof payload>,
	r: Recipient
): { title: string; body: string; url: string } {
	if (r.personId === p.guestId) {
		return {
			title: "Your guest access has ended",
			body: "Your guest access to the J floor has ended. Ask your host if you need more time.",
			url: homeUrl(),
		};
	}
	return {
		title: "Guest access ended",
		body: `${p.guestName}'s guest access has ended.`,
		url: personUrl(p.guestId),
	};
}

/** The one audience that keeps a non-entitled person: the guest whose window
 *  just closed is exactly who needs to hear it. */
export const guestExpired = defineKind({
	category: "guests",
	payload,
	audience: (ctx, { guestId }) =>
		guestAudience(ctx, guestId, { guest: "always" }),
	push: (p, r) => ({ ...copy(p, r), tag: `guest-${p.guestId}-expired` }),
	email: (p, r) => {
		return noticeEmail(copy(p, r));
	},
});
