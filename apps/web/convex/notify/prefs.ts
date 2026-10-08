import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireRole } from "../lib/authGuard.ts";
import { COMMUNITY_TIERS } from "../lib/roles.ts";

import {
	CATEGORY_INFO,
	type Category,
	categoriesForTier,
	categoryValidator,
	type NotificationPrefs,
	prefFor,
} from "./categories.ts";

export type CategoryPrefRow = {
	category: Category;
	label: string;
	description: string;
	note?: string;
	pushOnly?: boolean;
	push: boolean;
	email: boolean;
};

/** The caller's switches, one row per category their tier can receive. */
export const mine = query({
	args: {},
	handler: async (ctx): Promise<CategoryPrefRow[]> => {
		const person = await requireRole(ctx, COMMUNITY_TIERS);
		return categoriesForTier(person.tier).map((category) => {
			const info = CATEGORY_INFO[category];
			return {
				category,
				label: info.label,
				description: info.description,
				...(info.note ? { note: info.note } : {}),
				...(info.pushOnly ? { pushOnly: true } : {}),
				...prefFor(person.notificationPrefs, category),
				...(info.pushOnly ? { email: false } : {}),
			};
		});
	},
});

export const set = mutation({
	args: {
		category: categoryValidator,
		push: v.boolean(),
		email: v.boolean(),
	},
	handler: async (ctx, { category, push, email }): Promise<null> => {
		const person = await requireRole(ctx, COMMUNITY_TIERS);
		if (!categoriesForTier(person.tier).includes(category))
			throw new Error("Forbidden");
		const notificationPrefs: NotificationPrefs = {
			...(person.notificationPrefs ?? {}),
		};
		notificationPrefs[category] = {
			push,
			email: CATEGORY_INFO[category].pushOnly ? false : email,
		};
		await ctx.db.patch(person._id, { notificationPrefs });
		return null;
	},
});
