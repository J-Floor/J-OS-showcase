import { v } from "convex/values";

import { eventUrl } from "../../emails/urls.ts";
import { zonedTime } from "../../lib/time.ts";
import { communityIds } from "../audience.ts";
import { defineKind } from "../types.ts";

/** Push only, so each event sends at most one email per person. */
export const eventEndingSoon = defineKind({
	category: "events",
	payload: v.object({
		eventId: v.id("events"),
		name: v.string(),
		endsAtLocal: v.string(),
	}),
	audience: (ctx) => communityIds(ctx),
	push: ({ eventId, name, endsAtLocal }) => ({
		title: `${name} ends soon`,
		body: `Ends at ${zonedTime(endsAtLocal)}.`,
		url: eventUrl(eventId),
		tag: `event-${eventId}-end`,
	}),
});
