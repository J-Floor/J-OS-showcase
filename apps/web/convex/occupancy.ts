import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { ACTIVE_PROVIDER, CAPACITY } from "./lib/occupancy/index.ts";

export type OccupancyAnswer =
	| { enabled: false }
	| { enabled: true; count: number | null; capacity: number };

/**
 * Current occupancy from the active provider (see lib/occupancy). Disabled
 * when no provider is active: no network call, and the UI hides the card.
 */
export const current = action({
	args: {},
	handler: async (ctx): Promise<OccupancyAnswer> => {
		if (!(await ctx.runQuery(internal.people.callerInCommunity, {})))
			throw new Error("Forbidden");
		if (!ACTIVE_PROVIDER) return { enabled: false };
		const count = await ACTIVE_PROVIDER.count(Date.now());
		return { enabled: true, count, capacity: CAPACITY };
	},
});
