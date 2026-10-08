import { v, type Infer } from "convex/values";

import { homeUrl, personUrl, spaceUrl } from "../../emails/urls.ts";
import { defineKind, type Recipient } from "../types.ts";

import { guestAudience } from "./guestAudience.ts";
import { noticeEmail } from "./noticeEmail.ts";

const payload = v.union(
	v.object({
		guestId: v.id("people"),
		guestName: v.string(),
		change: v.literal("extended"),
		untilDate: v.string(),
	}),
	v.object({
		guestId: v.id("people"),
		guestName: v.string(),
		change: v.literal("shortened"),
		untilDate: v.string(),
	}),
	v.object({
		guestId: v.id("people"),
		guestName: v.string(),
		change: v.literal("upgraded"),
	})
);
type Payload = Infer<typeof payload>;

function copy(
	p: Payload,
	r: Recipient
): { title: string; body: string; url: string } {
	const isGuest = r.personId === p.guestId;
	if (p.change === "extended") {
		return isGuest
			? {
					title: "Your guest access was extended",
					body: `You now have access until ${p.untilDate}.`,
					url: spaceUrl(),
				}
			: {
					title: `${p.guestName}'s access was extended`,
					body: `${p.guestName}'s guest access now runs until ${p.untilDate}.`,
					url: personUrl(p.guestId),
				};
	}
	if (p.change === "shortened") {
		return isGuest
			? {
					title: "Your guest access was shortened",
					body: `Your guest access now ends on ${p.untilDate}.`,
					url: spaceUrl(),
				}
			: {
					title: `${p.guestName}'s access was shortened`,
					body: `${p.guestName}'s guest access now ends on ${p.untilDate}.`,
					url: personUrl(p.guestId),
				};
	}
	return isGuest
		? {
				title: "You're now a J floor member",
				body: "Your guest access is now a full membership.",
				url: homeUrl(),
			}
		: {
				title: `${p.guestName} is now a member`,
				body: `${p.guestName} was upgraded from guest to member.`,
				url: personUrl(p.guestId),
			};
}

export const guestAccessChanged = defineKind({
	category: "guests",
	payload,
	audience: (ctx, { guestId }) =>
		guestAudience(ctx, guestId, { guest: "entitled" }),
	push: (p, r) => ({ ...copy(p, r), tag: `guest-${p.guestId}-access` }),
	email: (p, r) => {
		// The lifecycle already mails the guest `memberUpgrade` for this event.
		if (p.change === "upgraded" && r.personId === p.guestId) return null;
		return noticeEmail(copy(p, r));
	},
});
