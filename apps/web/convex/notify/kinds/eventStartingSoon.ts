import { v } from "convex/values";

import { eventUrl } from "../../emails/urls.ts";
import { zonedTime } from "../../lib/time.ts";
import { communityIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/** Push only: the email provider's daily send cap cannot absorb event mail. */
export const eventStartingSoon = defineKind({
	category: "events",
	payload: v.object({
		eventId: v.id("events"),
		name: v.string(),
		startsAtLocal: v.string(),
	}),
	audience: (ctx) => communityIds(ctx),
	push: ({ eventId, name, startsAtLocal }) => ({
		title: `${name} starts soon`,
		body: `Starts at ${zonedTime(startsAtLocal)}.`,
		url: eventUrl(eventId),
		tag: `event-${eventId}-start`,
	}),
});
