import { v } from "convex/values";

import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { SIXTY_TWO_DAYS } from "./lib/constants.ts";
import {
	emailPriorityValidator,
	providerLimitsValidator,
	quotaWindowValidator,
	type EmailPriority,
	type ProviderLimits,
	type QuotaWindow,
} from "./lib/emailProvider.ts";

/** Share of each quota window a priority class may use. The rest is kept
 *  for the classes above it, so sign-in mail still goes out on a busy day. */
export const PRIORITY_CEILING: Record<EmailPriority, number> = {
	critical: 1,
	anonymous: 0.8,
	notification: 0.6,
	digest: 0.5,
};

const PURGE_BATCH = 100;

const WINDOWS: readonly QuotaWindow[] = ["daily", "monthly"];

export function windowKeys(now: number): Record<QuotaWindow, string> {
	const day = new Date(now).toISOString().split("T")[0];
	return {
		daily: `day:${day}`,
		monthly: `month:${day.slice(0, day.lastIndexOf("-"))}`,
	};
}

function windowStart(window: QuotaWindow, now: number): number {
	const date = new Date(now);
	return window === "daily"
		? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
		: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

// dry-ignore -- same index-and-unique read on a different table; a generic helper would erase the index name type-safety
async function rowFor(context: MutationCtx, key: string) {
	return context.db
		.query("emailQuota")
		.withIndex("by_window", (range) => range.eq("window", key))
		.unique();
}

async function setUsed(
	context: MutationCtx,
	window: QuotaWindow,
	now: number,
	used: (current: number) => number
): Promise<void> {
	const key = windowKeys(now)[window];
	const row = await rowFor(context, key);
	if (row) await context.db.patch(row._id, { used: used(row.used) });
	else
		await context.db.insert("emailQuota", {
			window: key,
			startsAt: windowStart(window, now),
			used: used(0),
		});
}

function limitedWindows(limits: ProviderLimits): [QuotaWindow, number][] {
	return WINDOWS.flatMap((window) => {
		const limit = limits[window];
		return limit === null ? [] : [[window, limit] as [QuotaWindow, number]];
	});
}

/** Reserve `cost` sends for `priority`. True and counted when every limited
 *  window stays within the class ceiling; false and untouched otherwise. */
export const reserve = internalMutation({
	args: {
		priority: emailPriorityValidator,
		cost: v.number(),
		limits: providerLimitsValidator,
	},
	handler: async (context, { priority, cost, limits }): Promise<boolean> => {
		const now = Date.now();
		const windows = limitedWindows(limits);
		for (const [window, limit] of windows) {
			const row = await rowFor(context, windowKeys(now)[window]);
			const ceiling = Math.floor(PRIORITY_CEILING[priority] * limit);
			if ((row?.used ?? 0) + cost > ceiling) return false;
		}
		for (const [window] of windows) {
			await setUsed(context, window, now, (used) => used + cost);
		}
		return true;
	},
});

/** Align the counters with what the provider reports: a used count raises
 *  ours (never lowers it); an exhausted window is filled to its limit. */
export const sync = internalMutation({
	args: {
		limits: providerLimitsValidator,
		dailyUsed: v.optional(v.number()),
		monthlyUsed: v.optional(v.number()),
		exhausted: v.optional(quotaWindowValidator),
	},
	handler: async (
		context,
		{ limits, dailyUsed, monthlyUsed, exhausted }
	): Promise<null> => {
		const now = Date.now();
		const reported: Record<QuotaWindow, number | undefined> = {
			daily: dailyUsed,
			monthly: monthlyUsed,
		};
		for (const [window, limit] of limitedWindows(limits)) {
			const floor = exhausted === window ? limit : reported[window];
			if (floor !== undefined)
				await setUsed(context, window, now, (used) =>
					Math.max(used, floor)
				);
		}
		return null;
	},
});

/** Drop quota rows past retention, a batch per run. */
export const purgeOld = internalMutation({
	args: {},
	handler: async (context): Promise<null> => {
		const stale = await context.db
			.query("emailQuota")
			.withIndex("by_startsAt", (range) =>
				range.lt("startsAt", Date.now() - SIXTY_TWO_DAYS)
			)
			.take(PURGE_BATCH);
		for (const row of stale) await context.db.delete(row._id);
		return null;
	},
});
