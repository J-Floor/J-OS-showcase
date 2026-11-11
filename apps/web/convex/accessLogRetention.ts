import type { FunctionReference } from "convex/server";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { DAY_MS } from "./lib/constants.ts";

const DAYS_PER_YEAR = 365;
export const TWELVE_MONTHS = DAYS_PER_YEAR * DAY_MS;
export const RETENTION_BATCH = 500;

/** Delete a fetched batch, then run `again` right away when it was full. */
async function deleteBatch(
	context: MutationCtx,
	rows: { _id: Id<"doorLog"> | Id<"personEvents"> }[],
	again: FunctionReference<"mutation", "internal">
): Promise<{ deleted: number }> {
	for (const row of rows) await context.db.delete(row._id);
	if (rows.length === RETENTION_BATCH)
		await context.scheduler.runAfter(0, again, {});
	return { deleted: rows.length };
}

/**
 * Delete door log rows older than 12 months, RETENTION_BATCH per run,
 * rescheduling itself while a batch comes back full. Deleting shrinks the
 * index range, so each `.take()` reads new rows.
 */
export const purgeDoorLog = internalMutation({
	args: {},
	handler: async (context): Promise<{ deleted: number }> => {
		const cutoff = Date.now() - TWELVE_MONTHS;
		const rows = await context.db
			.query("doorLog")
			.withIndex("by_at", (range) => range.lt("at", cutoff))
			.take(RETENTION_BATCH);
		return deleteBatch(
			context,
			rows,
			internal.accessLogRetention.purgeDoorLog
		);
	},
});

/** Same for the Wi-Fi-dialog-open audit events; other kinds are kept. */
export const purgeWifiEvents = internalMutation({
	args: {},
	handler: async (context): Promise<{ deleted: number }> => {
		const cutoff = Date.now() - TWELVE_MONTHS;
		const rows = await context.db
			.query("personEvents")
			.withIndex("by_kind_and_at", (range) =>
				range.eq("kind", "wifi").lt("at", cutoff)
			)
			.take(RETENTION_BATCH);
		return deleteBatch(
			context,
			rows,
			internal.accessLogRetention.purgeWifiEvents
		);
	},
});
