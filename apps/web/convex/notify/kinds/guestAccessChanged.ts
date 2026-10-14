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
	details: Payload,
	recipient: Recipient
): { title: string; body: string; url: string } {
	const isGuest = recipient.personId === details.guestId;
	if (details.change === "extended") {
		return isGuest
			? {
					title: "Your guest access was extended",
					body: `You now have access until ${details.untilDate}.`,
					url: spaceUrl(),
				}
			: {
					title: `${details.guestName}'s access was extended`,
					body: `${details.guestName}'s guest access now runs until ${details.untilDate}.`,
					url: personUrl(details.guestId),
				};
	}
	if (details.change === "shortened") {
		return isGuest
			? {
					title: "Your guest access was shortened",
					body: `Your guest access now ends on ${details.untilDate}.`,
					url: spaceUrl(),
				}
			: {
					title: `${details.guestName}'s access was shortened`,
					body: `${details.guestName}'s guest access now ends on ${details.untilDate}.`,
					url: personUrl(details.guestId),
				};
	}
	return isGuest
		? {
				title: "You're now a J floor member",
				body: "Your guest access is now a full membership.",
				url: homeUrl(),
			}
		: {
				title: `${details.guestName} is now a member`,
				body: `${details.guestName} was upgraded from guest to member.`,
				url: personUrl(details.guestId),
			};
}

export const guestAccessChanged = defineKind({
	category: "guests",
	payload,
	audience: (context, { guestId }) =>
		guestAudience(context, guestId, { guest: "entitled" }),
	push: (details, recipient) => ({
		...copy(details, recipient),
		tag: `guest-${details.guestId}-access`,
	}),
	email: (details, recipient) => {
		// The lifecycle already mails the guest `memberUpgrade` for this event.
		return details.change === "upgraded" &&
			recipient.personId === details.guestId
			? null
			: noticeEmail(copy(details, recipient));
	},
});
