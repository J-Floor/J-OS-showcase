import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

import { uniqueIds } from "./audience.ts";
import { kindDef, kindValidator } from "./registry.ts";
import type { ResolvedRecipient } from "./types.ts";

/** Audience → people, each with their preferences and push subscriptions. Run
 *  as a query so dispatch (an action) reads one consistent snapshot. */
export const resolve = internalQuery({
	args: { kind: kindValidator, payload: v.any() },
	handler: async (ctx, { kind, payload }): Promise<ResolvedRecipient[]> => {
		const ids = uniqueIds(await kindDef(kind).audience(ctx, payload));
		const out: ResolvedRecipient[] = [];
		for (const personId of ids) {
			const person = await ctx.db.get(personId);
			if (!person) continue;
			const subscriptions = await ctx.db
				.query("pushSubscriptions")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect();
			out.push({
				personId,
				email: person.email,
				firstName: person.firstName,
				tier: person.tier,
				prefs: person.notificationPrefs,
				subscriptions: subscriptions.map((s) => ({
					endpoint: s.endpoint,
					p256dh: s.p256dh,
					auth: s.auth,
				})),
			});
		}
		return out;
	},
});
