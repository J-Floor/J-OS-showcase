import { v } from "convex/values";

import { boardLifecycleAlert } from "../../emails/generated/boardLifecycleAlert.ts";
import {
	communityUrl,
	emailUrls,
	manageNotificationsUrl,
	personUrl,
} from "../../emails/urls.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/**
 * People whose lifecycle state disagrees with their data, found by the
 * nightly check. Whether to send is decided by `opsAlerts.claim` at the caller.
 * `items` is empty on the all-clear.
 */
export const lifecycleAlert = defineKind({
	// Board-only operational alert about people, so it shares the applications switch.
	category: "applications",
	payload: v.object({
		headline: v.string(),
		items: v.array(
			v.object({
				personId: v.string(),
				name: v.string(),
				code: v.string(),
				detail: v.string(),
			})
		),
		tag: v.string(),
	}),
	audience: (ctx) => boardIds(ctx),
	push: ({ headline, items, tag }) => ({
		title: headline,
		body:
			items.length > 0
				? "Open the email for the list of people."
				: "Nothing needs attention.",
		url: communityUrl(),
		tag,
	}),
	email: ({ headline, items }) => {
		const { html, text } = boardLifecycleAlert({
			headline,
			rows: items.map((i) => ({
				name: i.name,
				url: personUrl(i.personId),
				code: i.code,
				detail: i.detail,
			})),
			communityUrl: communityUrl(),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return { subject: headline, html, text };
	},
});
