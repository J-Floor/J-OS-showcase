import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

import { uniqueIds } from "./audience.ts";
import { kindDefinition, kindValidator } from "./registry.ts";
import type { ResolvedRecipient } from "./types.ts";

/** Audience → people, each with their preferences and push subscriptions. Run
 *  as a query so dispatch (an action) reads one consistent snapshot. */
export const resolve = internalQuery({
	args: { kind: kindValidator, payload: v.any() },
	handler: async (
		context,
		{ kind, payload }
	): Promise<ResolvedRecipient[]> => {
		const ids = uniqueIds(
			await kindDefinition(kind).audience(context, payload)
		);
		const out: ResolvedRecipient[] = [];
		for (const personId of ids) {
			const person = await context.db.get(personId);
			if (!person) continue;
			const subscriptions = await context.db
				.query("pushSubscriptions")
				.withIndex("by_person", (range) =>
					range.eq("personId", personId)
				)
				.collect();
			out.push({
				personId,
				email: person.email,
				firstName: person.firstName,
				tier: person.tier,
				prefs: person.notificationPrefs,
				subscriptions: subscriptions.map((subscription) => ({
					endpoint: subscription.endpoint,
					p256dh: subscription.p256dh,
					auth: subscription.auth,
				})),
			});
		}
		return out;
	},
});
