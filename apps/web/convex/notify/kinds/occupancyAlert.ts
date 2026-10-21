import { v } from "convex/values";

import { boardOccupancyAlert } from "../../emails/generated/boardOccupancyAlert.ts";
import {
	emailUrls,
	insightsUrl,
	manageNotificationsUrl,
} from "../../emails/urls.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/**
 * The occupancy counter went quiet past its normal reporting gap, or came
 * back. Whether to send is decided by `opsAlerts.claim` at the caller. Push
 * and email. `tag` is the opsAlerts key, so a newer alert replaces the older
 * one.
 */
export const occupancyAlert = defineKind({
	category: "doors",
	payload: v.object({ title: v.string(), body: v.string(), tag: v.string() }),
	audience: (context) => boardIds(context),
	push: ({ title, body, tag }) => ({ title, body, url: insightsUrl(), tag }),
	email: ({ title, body }) => {
		const { html, text } = boardOccupancyAlert({
			headline: title,
			detail: body,
			insightsUrl: insightsUrl(),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return {
			subject: "J floor occupancy counter needs attention",
			html,
			text,
		};
	},
});
