import { v } from "convex/values";

import { boardNewApplication } from "../../emails/generated/boardNewApplication.ts";
import {
	emailUrls,
	manageNotificationsUrl,
	personUrl,
} from "../../emails/urls.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

export const newApplication = defineKind({
	category: "applications",
	payload: v.object({
		personId: v.id("people"),
		applicantName: v.string(),
		venture: v.string(),
	}),
	audience: (ctx) => boardIds(ctx),
	push: ({ personId, applicantName, venture }) => ({
		title: "New application",
		body: `${applicantName} from ${venture} applied.`,
		url: personUrl(personId),
		tag: `application-${personId}`,
	}),
	email: ({ personId, applicantName, venture }) => {
		const { html, text } = boardNewApplication({
			applicantName,
			venture,
			// Straight to the applicant's drawer, not the Applications roster.
			reviewUrl: personUrl(personId),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return { subject: "New J floor application to review", html, text };
	},
});
