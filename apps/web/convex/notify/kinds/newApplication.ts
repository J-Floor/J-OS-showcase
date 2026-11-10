import { v } from "convex/values";

import { personUrl } from "../../emails/urls.ts";
import { boardIds } from "../audience.ts";
import { defineKind } from "../types.ts";

export const newApplication = defineKind({
	category: "applications",
	delivery: "digest",
	payload: v.object({
		personId: v.id("people"),
		applicantName: v.string(),
		venture: v.string(),
	}),
	audience: (context) => boardIds(context),
	push: ({ personId, applicantName, venture }) => ({
		title: "New application",
		body: `${applicantName} from ${venture} applied.`,
		url: personUrl(personId),
		tag: `application-${personId}`,
	}),
});
