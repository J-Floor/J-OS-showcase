import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
	internalMutation,
	mutation,
	type MutationCtx,
	query,
} from "../_generated/server";
import { requireRole } from "../lib/authGuard.ts";
import {
	NINETY_DAYS,
	NOTIFICATIONS_PAGE_SIZE,
	UNREAD_COUNT_CAP,
} from "../lib/constants.ts";
import { COMMUNITY_TIERS } from "../lib/roles.ts";

/**
 * Notification history: every notification a person is sent, kept in the
 * `notifications` table for 90 days and shown in the Notifications drawer.
 * (`convex/notifications.ts` is the transactional emails, hence the
 * different name.) Every public function reads or writes the caller's rows
 * only. Pagination mirrors the door log (`convex/doorLog.ts`): a fixed floor,
 * a live head above it, and older pages fetched once each below it.
 */

export const MARK_ALL_BATCH = 500;
export const PURGE_BATCH = 500;

export type InboxRow = {
	_id: Id<"notifications">;
	title: string;
	body: string;
	url: string;
	createdAt: number;
	read: boolean;
};

function toInboxRow(row: Doc<"notifications">): InboxRow {
	return {
		_id: row._id,
		title: row.title,
		body: row.body,
		url: row.url,
		createdAt: row.createdAt,
		read: row.readAt !== undefined,
	};
}

/**
 * The in-app path of a notification's absolute URL: what a history row
 * stores, so rows outlive a SITE_URL change and the client navigates to them
 * directly. A URL that does not parse lands on `/`.
 */
export function appPath(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return "/";
	}
}

const historyRow = v.object({
	personId: v.id("people"),
	title: v.string(),
	body: v.string(),
	url: v.string(),
});

/** One unread row per recipient of one notification, sharing one `createdAt`. */
export const record = internalMutation({
	args: { kind: v.string(), rows: v.array(historyRow) },
	handler: async (context, { kind, rows }): Promise<null> => {
		const createdAt = Date.now();
		for (const row of rows) {
			await context.db.insert("notifications", {
				personId: row.personId,
				kind,
				title: row.title,
				body: row.body,
				url: row.url,
				createdAt,
			});
		}
		return null;
	},
});

/** The `createdAt` of the caller's NOTIFICATIONS_PAGE_SIZE-th newest row, or
 *  null when their history fits one page. */
export const firstPageFloor = query({
	args: {},
	handler: async (context): Promise<{ since: number | null }> => {
		const person = await requireRole(context, COMMUNITY_TIERS);
		const rows = await context.db
			.query("notifications")
			.withIndex("by_personId_and_createdAt", (range) =>
				range.eq("personId", person._id)
			)
			.order("desc")
			.take(NOTIFICATIONS_PAGE_SIZE + 1);
		const floor =
			rows.length > NOTIFICATIONS_PAGE_SIZE
				? rows[NOTIFICATIONS_PAGE_SIZE - 1]
				: undefined;
		return { since: floor ? floor.createdAt : null };
	},
});

/** The caller's rows with `createdAt >= since` (all of them when null),
 *  newest first. The drawer's live head. */
export const listSince = query({
	args: { since: v.union(v.number(), v.null()) },
	handler: async (context, { since }): Promise<InboxRow[]> => {
		const person = await requireRole(context, COMMUNITY_TIERS);
		const rows = await context.db
			.query("notifications")
			.withIndex("by_personId_and_createdAt", (range) =>
				since === null
					? range.eq("personId", person._id)
					: range.eq("personId", person._id).gte("createdAt", since)
			)
			.order("desc")
			.collect();
		return rows.map((row) => toInboxRow(row));
	},
});

/** One page of the caller's rows with `createdAt < before`, newest first. */
export const listBefore = query({
	args: { before: v.number(), paginationOpts: paginationOptsValidator },
	handler: async (
		context,
		{ before, paginationOpts }
	): Promise<PaginationResult<InboxRow>> => {
		const person = await requireRole(context, COMMUNITY_TIERS);
		const result = await context.db
			.query("notifications")
			.withIndex("by_personId_and_createdAt", (range) =>
				range.eq("personId", person._id).lt("createdAt", before)
			)
			.order("desc")
			.paginate(paginationOpts);
		return { ...result, page: result.page.map((row) => toInboxRow(row)) };
	},
});

/** The caller's unread rows, read no further than one past the cap: the
 *  client shows `99+` above UNREAD_COUNT_CAP. */
export const unreadCount = query({
	args: {},
	handler: async (context): Promise<number> => {
		const person = await requireRole(context, COMMUNITY_TIERS);
		const rows = await context.db
			.query("notifications")
			.withIndex("by_personId_and_readAt", (range) =>
				range.eq("personId", person._id).eq("readAt", undefined)
			)
			.take(UNREAD_COUNT_CAP + 1);
		return rows.length;
	},
});

/** Mark one of the caller's rows read. An already-read row keeps its `readAt`. */
export const markRead = mutation({
	args: { id: v.id("notifications") },
	handler: async (context, { id }): Promise<null> => {
		const person = await requireRole(context, COMMUNITY_TIERS);
		const row = await context.db.get(id);
		if (!row) throw new Error("Not found");
		if (row.personId !== person._id) throw new Error("Forbidden");
		if (row.readAt === undefined)
			await context.db.patch(id, { readAt: Date.now() });
		return null;
	},
});

/**
 * Patch one batch of a person's unread rows and, while batches come back
 * full, schedule the next. Patching `readAt` moves each row out of the
 * `readAt === undefined` index range, so the next `.take()` reads new rows.
 */
async function markBatchRead(
	context: MutationCtx,
	personId: Id<"people">
): Promise<void> {
	const rows = await context.db
		.query("notifications")
		.withIndex("by_personId_and_readAt", (range) =>
			range.eq("personId", personId).eq("readAt", undefined)
		)
		.take(MARK_ALL_BATCH);
	const readAt = Date.now();
	for (const row of rows) await context.db.patch(row._id, { readAt });
	if (rows.length === MARK_ALL_BATCH)
		await context.scheduler.runAfter(
			0,
			internal.notify.inbox.markAllReadFor,
			{
				personId,
			}
		);
}

export const markAllRead = mutation({
	args: {},
	handler: async (context): Promise<null> => {
		const person = await requireRole(context, COMMUNITY_TIERS);
		await markBatchRead(context, person._id);
		return null;
	},
});

/** The continuation `markAllRead` schedules while a batch comes back full. */
export const markAllReadFor = internalMutation({
	args: { personId: v.id("people") },
	handler: async (context, { personId }): Promise<null> => {
		await markBatchRead(context, personId);
		return null;
	},
});

/**
 * Delete history older than 90 days, PURGE_BATCH rows per run, rescheduling
 * itself while a batch comes back full (the shape of
 * `lifecycle.sweepExpiredWindows`). Deleting shrinks the index range, so each
 * `.take()` reads new rows.
 */
export const purgeExpired = internalMutation({
	args: {},
	handler: async (context): Promise<{ deleted: number }> => {
		const cutoff = Date.now() - NINETY_DAYS;
		const rows = await context.db
			.query("notifications")
			.withIndex("by_createdAt", (range) => range.lt("createdAt", cutoff))
			.take(PURGE_BATCH);
		for (const row of rows) await context.db.delete(row._id);
		if (rows.length === PURGE_BATCH)
			await context.scheduler.runAfter(
				0,
				internal.notify.inbox.purgeExpired,
				{}
			);
		return { deleted: rows.length };
	},
});
