// The public site's traffic for the board's Website page: one cached summary
// per range, fetched from the web analytics provider on demand.
//
// Cached and guarded because the provider's budget is small and shared: every
// board member reads the same snapshot, and a range is fetched at most once
// per REFRESH_GUARD_MS however often anyone presses refresh. The guard is a
// claim written in one transaction, so concurrent refreshes cannot all pass it.
//
// No "use node": the provider is a pure fetch client.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
	action,
	internalMutation,
	internalQuery,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import {
	refreshOpensAt,
	webAnalyticsErrorKindValidator,
	webAnalyticsRangeValidator,
	webAnalyticsSummaryValidator,
	type WebAnalyticsErrorKind,
	type WebAnalyticsRange,
} from "./lib/webAnalytics.ts";
import {
	webAnalyticsConfigured,
	webAnalyticsProvider,
} from "./lib/webAnalyticsEnv.ts";

type SnapshotDoc = Doc<"websiteAnalyticsSnapshots">;
type StoredSnapshot = Pick<
	SnapshotDoc,
	"fetchedAt" | "summary" | "lastError" | "attemptedAt"
>;

export type SnapshotView = {
	/** The range this view answers, so a page can tell it from a stale one. */
	days: WebAnalyticsRange;
	configured: boolean;
	snapshot: StoredSnapshot | null;
};

export type RefreshOutcome =
	| { kind: "refreshed" }
	| { kind: "skipped" }
	| { kind: "notConfigured" }
	| { kind: "failed"; error: WebAnalyticsErrorKind };

function stored(row: SnapshotDoc | null): StoredSnapshot | null {
	if (!row) return null;
	const { fetchedAt, summary, lastError, attemptedAt } = row;
	return { fetchedAt, summary, lastError, attemptedAt };
}

function snapshotRow(
	database: QueryCtx["db"],
	days: WebAnalyticsRange
): Promise<SnapshotDoc | null> {
	return database
		.query("websiteAnalyticsSnapshots")
		.withIndex("by_days", (range) => range.eq("days", days))
		.unique();
}

/** Patches the range's row with `fields`, creating it when there is none. */
async function upsertSnapshot(
	context: MutationCtx,
	days: WebAnalyticsRange,
	fields: Partial<Omit<SnapshotDoc, "_id" | "_creationTime" | "days">>
): Promise<void> {
	const row = await snapshotRow(context.db, days);
	if (row) await context.db.patch(row._id, fields);
	else
		await context.db.insert("websiteAnalyticsSnapshots", {
			days,
			...fields,
		});
}

export const snapshot = query({
	args: { days: webAnalyticsRangeValidator },
	handler: async (context, { days }): Promise<SnapshotView> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		return {
			days,
			configured: webAnalyticsConfigured(),
			snapshot: stored(await snapshotRow(context.db, days)),
		};
	},
});

/** Board gate for {@link refresh}, which as an action has no `ctx.db`. */
export const callerIsBoard = internalQuery({
	args: {},
	handler: async (context): Promise<boolean> => {
		const access = await requireRole(context, BOARD_LEVEL);
		return access.isOk();
	},
});

/** Takes the range's refresh slot: false when one was taken within the guard
 *  window, otherwise records this attempt and returns true. */
export const claimRefresh = internalMutation({
	args: { days: webAnalyticsRangeValidator, now: v.number() },
	handler: async (context, { days, now }): Promise<boolean> => {
		const row = await snapshotRow(context.db, days);
		if (now < refreshOpensAt(row)) return false;
		await upsertSnapshot(context, days, { attemptedAt: now });
		return true;
	},
});

export const recordSuccess = internalMutation({
	args: {
		days: webAnalyticsRangeValidator,
		summary: webAnalyticsSummaryValidator,
		fetchedAt: v.number(),
	},
	handler: async (context, { days, summary, fetchedAt }): Promise<void> => {
		await upsertSnapshot(context, days, {
			summary,
			fetchedAt,
			lastError: undefined,
		});
	},
});

export const recordFailure = internalMutation({
	args: {
		days: webAnalyticsRangeValidator,
		kind: webAnalyticsErrorKindValidator,
		at: v.number(),
	},
	handler: async (context, { days, kind, at }): Promise<void> => {
		await upsertSnapshot(context, days, { lastError: { at, kind } });
	},
});

export const refresh = action({
	args: { days: webAnalyticsRangeValidator },
	handler: async (context, { days }): Promise<RefreshOutcome> => {
		const isBoard = await context.runQuery(
			internal.websiteAnalytics.callerIsBoard,
			{}
		);
		if (!isBoard) refuse({ type: "Forbidden" });
		const provider = webAnalyticsProvider();
		if (!provider) return { kind: "notConfigured" };
		const now = Date.now();
		const isClaimed = await context.runMutation(
			internal.websiteAnalytics.claimRefresh,
			{ days, now }
		);
		if (!isClaimed) return { kind: "skipped" };
		const result = await provider.summary(days, now);
		if (result.isErr()) {
			await context.runMutation(internal.websiteAnalytics.recordFailure, {
				days,
				kind: result.error.kind,
				at: now,
			});
			return { kind: "failed", error: result.error.kind };
		}
		await context.runMutation(internal.websiteAnalytics.recordSuccess, {
			days,
			summary: result.value,
			fetchedAt: now,
		});
		return { kind: "refreshed" };
	},
});
