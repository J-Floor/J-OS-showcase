import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const TWELVE_MONTHS = 365 * 24 * 60 * 60 * 1000;
export const RETENTION_BATCH = 500;

/**
 * Delete door log rows older than 12 months, RETENTION_BATCH per run,
 * rescheduling itself while a batch comes back full. Deleting shrinks the
 * index range, so each `.take()` reads new rows.
 */
export const purgeDoorLog = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ deleted: number }> => {
		const cutoff = Date.now() - TWELVE_MONTHS;
		const rows = await ctx.db
			.query("doorLog")
			.withIndex("by_at", (q) => q.lt("at", cutoff))
			.take(RETENTION_BATCH);
		for (const row of rows) await ctx.db.delete(row._id);
		if (rows.length === RETENTION_BATCH)
			await ctx.scheduler.runAfter(
				0,
				internal.accessLogRetention.purgeDoorLog,
				{}
			);
		return { deleted: rows.length };
	},
});

/** Same for the Wi-Fi-dialog-open audit events; other kinds are kept. */
export const purgeWifiEvents = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ deleted: number }> => {
		const cutoff = Date.now() - TWELVE_MONTHS;
		const rows = await ctx.db
			.query("personEvents")
			.withIndex("by_kind_and_at", (q) =>
				q.eq("kind", "wifi").lt("at", cutoff)
			)
			.take(RETENTION_BATCH);
		for (const row of rows) await ctx.db.delete(row._id);
		if (rows.length === RETENTION_BATCH)
			await ctx.scheduler.runAfter(
				0,
				internal.accessLogRetention.purgeWifiEvents,
				{}
			);
		return { deleted: rows.length };
	},
});
