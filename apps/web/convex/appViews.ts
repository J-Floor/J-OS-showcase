// Anonymous view counts. A view is counted once per person, per key, per
// day: the viewer is a salted hash, and the nightly job deletes the day's
// salt and hits, leaving only per-day counts per key. See
// docs/superpowers/specs/2026-11-26-app-view-analytics-design.md.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, TableNames } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import {
	bucketOf,
	buildSummary,
	MAX_KEYS_PER_DAY,
	mergeToday,
	NO_VIEWS,
	parseViewKey,
	shiftDay,
	SHOWN_TOP,
	SNAPSHOT_TOP,
	VIEW_PAGES,
	viewSummaryValidator,
	type DailyRow,
	type LabelledView,
	type ParsedViewKey,
	type RankedView,
	type RoleBucket,
	type RoleCounts,
	type ShownViewSummary,
	type ViewKind,
} from "./lib/appViews.ts";
import { requireRole } from "./lib/authGuard.ts";
import { rateLimiter } from "./lib/rateLimit.ts";
import { unwrap } from "./lib/result.ts";
import { ACCESS_TIERS, BOARD_LEVEL } from "./lib/roles.ts";
import { randomHex, sha256HexOfText } from "./lib/sha256.ts";
import { SITE_TIMEZONE, todayIn } from "./lib/time.ts";
import {
	WEB_ANALYTICS_RANGES,
	webAnalyticsRangeValidator,
} from "./lib/webAnalytics.ts";

const SALT_BYTES = 32;

function viewDay(now: number): string {
	return todayIn(SITE_TIMEZONE, now);
}

type LabelLookup = (
	context: QueryCtx,
	slug: string
) => Promise<string | undefined>;

/** A lookup that reads the document a slug names and labels it. */
function labelOf<Table extends TableNames>(
	table: Table,
	pick: (doc: Doc<Table>) => string
): LabelLookup {
	return async (context, slug) => {
		const id = context.db.normalizeId(table, slug);
		const doc = id ? await context.db.get(id) : null;
		return doc ? pick(doc) : undefined;
	};
}

/** How each entity kind turns a slug into its label, read when it is shown
 *  or counted; undefined once the entity is gone. */
const ENTITY_LABELS: Record<ViewKind, LabelLookup> = {
	person: labelOf(
		"people",
		(person) => `${person.firstName} ${person.lastName}`
	),
	event: labelOf("events", (event) => event.name),
	perk: labelOf("perks", (perk) => perk.title),
	request: async (context, slug) => {
		const id = context.db.normalizeId("perkRequests", slug);
		const request = id ? await context.db.get(id) : null;
		const perk = request ? await context.db.get(request.perkId) : null;
		return perk ? `${perk.title} request` : undefined;
	},
	task: labelOf("tasks", (task) => task.title),
	project: labelOf("projects", (project) => project.name),
	item: async (context, slug) => {
		const item = await context.db
			.query("items")
			.withIndex("by_assetTag", (range) => range.eq("assetTag", slug))
			.unique();
		return item?.assetTag;
	},
	type: labelOf("itemTypes", (type) => type.name),
	category: labelOf("itemCategories", (category) => category.name),
};

async function keyLabel(
	context: QueryCtx,
	parsed: ParsedViewKey
): Promise<string | undefined> {
	return parsed.type === "page"
		? VIEW_PAGES[parsed.moduleId]
		: ENTITY_LABELS[parsed.kind](context, parsed.slug);
}

/** Today's counts of a row, without its other fields. */
function countsOf({ members, board, guests }: RoleCounts): RoleCounts {
	return { members, board, guests };
}

function dailyRow(context: QueryCtx, day: string, key: string) {
	return context.db
		.query("viewDaily")
		.withIndex("by_day_key", (range) => range.eq("day", day).eq("key", key))
		.unique();
}

async function addOne(
	context: MutationCtx,
	view: { day: string; key: string },
	bucket: RoleBucket
) {
	const row = await dailyRow(context, view.day, view.key);
	if (row) await context.db.patch(row._id, { [bucket]: row[bucket] + 1 });
	else
		await context.db.insert("viewDaily", {
			...view,
			...NO_VIEWS,
			[bucket]: 1,
		});
}

async function withinRateLimit(
	context: MutationCtx,
	person: Doc<"people">
): Promise<boolean> {
	const { ok } = await rateLimiter.limit(context, "viewRecord", {
		key: person._id,
	});
	return ok;
}

/** Counts one view of `key` by `person` today, unless it is not countable:
 *  no salt yet, already seen, a missing entity, or rate-limited. */
async function countView(
	context: MutationCtx,
	person: Doc<"people">,
	view: { key: string; parsed: ParsedViewKey }
): Promise<void> {
	const { key } = view;
	const day = viewDay(Date.now());
	const salt = await context.db
		.query("viewSalts")
		.withIndex("by_day", (range) => range.eq("day", day))
		.unique();
	if (!salt) {
		// Mutations cannot make randomness: an action makes the salt, and
		// this view goes uncounted. The person's rate limit caps how many
		// salt jobs one caller can queue.
		if (await withinRateLimit(context, person))
			await context.scheduler.runAfter(
				0,
				internal.appViews.prepareSalts,
				{}
			);
		return;
	}
	const viewerHash = await sha256HexOfText(`${salt.salt}:${person._id}`);
	const seen = await context.db
		.query("viewHits")
		.withIndex("by_day_viewer_key", (range) =>
			range.eq("day", day).eq("viewerHash", viewerHash).eq("key", key)
		)
		.unique();
	if (seen) return;
	// Only a key that names something is counted; its label is not stored.
	const isKnown = (await keyLabel(context, view.parsed)) !== undefined;
	if (!isKnown || !(await withinRateLimit(context, person))) return;
	await context.db.insert("viewHits", { day, viewerHash, key });
	await addOne(context, { day, key }, bucketOf(person.tier));
}

export const recordView = mutation({
	args: { key: v.string() },
	handler: async (context, { key }): Promise<null> => {
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
		// Unknown or oversized keys stop here, before the salt or any view read.
		const parsed = parseViewKey(key);
		if (parsed) await countView(context, person, { key, parsed });
		return null;
	},
});

export const today = query({
	args: { key: v.string() },
	handler: async (context, { key }): Promise<RoleCounts> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const row = await dailyRow(context, viewDay(Date.now()), key);
		return row ? countsOf(row) : NO_VIEWS;
	},
});

export const ensureSalt = internalMutation({
	args: { day: v.string(), salt: v.string() },
	handler: async (context, { day, salt }): Promise<null> => {
		const existing = await context.db
			.query("viewSalts")
			.withIndex("by_day", (range) => range.eq("day", day))
			.unique();
		if (!existing) await context.db.insert("viewSalts", { day, salt });
		return null;
	},
});

/** Makes today's and tomorrow's salt when missing. Nightly, and on demand
 *  from a view that found none. */
export const prepareSalts = internalAction({
	args: {},
	handler: async (context): Promise<null> => {
		const day = viewDay(Date.now());
		for (const each of [day, shiftDay(day, 1)])
			await context.runMutation(internal.appViews.ensureSalt, {
				day: each,
				salt: randomHex(SALT_BYTES),
			});
		return null;
	},
});

const PURGE_BATCH = 500;
const KEEP_DAYS = 365;
const LONGEST_RANGE = 90;

/** Deletes past days' hits and salts, and counts older than KEEP_DAYS.
 *  PURGE_BATCH rows per table per run; reschedules while any batch was full.
 *  Deleting shrinks each range, so the next run reads fresh rows. */
export const purgeExpired = internalMutation({
	args: {},
	handler: async (context): Promise<null> => {
		const day = viewDay(Date.now());
		const hits = await context.db
			.query("viewHits")
			.withIndex("by_day_viewer_key", (range) => range.lt("day", day))
			.take(PURGE_BATCH);
		const salts = await context.db
			.query("viewSalts")
			.withIndex("by_day", (range) => range.lt("day", day))
			.take(PURGE_BATCH);
		const old = await context.db
			.query("viewDaily")
			.withIndex("by_day_key", (range) =>
				range.lt("day", shiftDay(day, -KEEP_DAYS))
			)
			.take(PURGE_BATCH);
		for (const row of [...hits, ...salts, ...old])
			await context.db.delete(row._id);
		if ([hits, salts, old].some((rows) => rows.length === PURGE_BATCH))
			await context.scheduler.runAfter(
				0,
				internal.appViews.purgeExpired,
				{}
			);
		return null;
	},
});

function dailyRowsOf(context: QueryCtx, day: string) {
	return context.db
		.query("viewDaily")
		.withIndex("by_day_key", (range) => range.eq("day", day))
		.take(MAX_KEYS_PER_DAY);
}

function toDailyRows(rows: Doc<"viewDaily">[]): DailyRow[] {
	return rows.map((row) => ({
		day: row.day,
		key: row.key,
		...countsOf(row),
	}));
}

export const dailyRows = internalQuery({
	args: { day: v.string() },
	handler: async (context, { day }): Promise<DailyRow[]> =>
		toDailyRows(await dailyRowsOf(context, day)),
});

export const writeSnapshot = internalMutation({
	args: {
		days: webAnalyticsRangeValidator,
		builtAt: v.number(),
		summary: viewSummaryValidator,
	},
	handler: async (context, { days, builtAt, summary }): Promise<null> => {
		const row = await context.db
			.query("viewSnapshots")
			.withIndex("by_days", (range) => range.eq("days", days))
			.unique();
		if (row) await context.db.patch(row._id, { builtAt, summary });
		else
			await context.db.insert("viewSnapshots", {
				days,
				builtAt,
				summary,
			});
		return null;
	},
});

/** Rebuilds the 7/30/90-day snapshots from past days' counts, one day per
 *  query so no transaction reads the whole range. */
export const rebuildSnapshots = internalAction({
	args: {},
	handler: async (context): Promise<null> => {
		const now = Date.now();
		const day = viewDay(now);
		const yesterday = shiftDay(day, -1);
		const rows: DailyRow[] = [];
		for (let back = 1; back <= LONGEST_RANGE - 1; back++)
			rows.push(
				...(await context.runQuery(internal.appViews.dailyRows, {
					day: shiftDay(day, -back),
				}))
			);
		for (const days of WEB_ANALYTICS_RANGES)
			await context.runMutation(internal.appViews.writeSnapshot, {
				days,
				builtAt: now,
				summary: buildSummary(
					rows,
					shiftDay(day, -(days - 1)),
					yesterday,
					SNAPSHOT_TOP
				),
			});
		return null;
	},
});

const MAX_GAP_DAYS = 2;

/** The past days the snapshot misses: from the day it was built (or, with no
 *  snapshot, the most recent ones) up to yesterday, inside the range, newest
 *  MAX_GAP_DAYS only. */
function gapDays(
	snapshot: Doc<"viewSnapshots"> | null,
	day: string,
	from: string
): string[] {
	const start = snapshot ? viewDay(snapshot.builtAt) : from;
	const days: string[] = [];
	for (let back = 1; back <= MAX_GAP_DAYS; back++) {
		const gap = shiftDay(day, -back);
		if (gap >= start && gap >= from) days.push(gap);
	}
	return days;
}

/** The first SHOWN_TOP views whose key still names something, labelled.
 *  A deleted or erased entity drops out here, so no stored name outlives
 *  it. `views` is at most SNAPSHOT_TOP long, which bounds the reads. */
async function labelled(
	context: QueryCtx,
	views: RankedView[]
): Promise<LabelledView[]> {
	const shown: LabelledView[] = [];
	for (const view of views) {
		if (shown.length === SHOWN_TOP) break;
		const parsed = parseViewKey(view.key);
		const label = parsed && (await keyLabel(context, parsed));
		if (label !== undefined) shown.push({ ...view, label });
	}
	return shown;
}

/** The snapshot's past days plus today's counts, read live. Days between the
 *  snapshot's build and today (the nightly rebuild has not run, or failed)
 *  are read live too, newest MAX_GAP_DAYS at most. Ranks still keep counts
 *  of the day that drops out of `daily` in that gap; that is accepted. */
export const summary = query({
	args: { days: webAnalyticsRangeValidator },
	handler: async (context, { days }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const day = viewDay(Date.now());
		const from = shiftDay(day, -(days - 1));
		const snapshot = await context.db
			.query("viewSnapshots")
			.withIndex("by_days", (range) => range.eq("days", days))
			.unique();
		const live: DailyRow[] = [];
		for (const each of [day, ...gapDays(snapshot, day, from)])
			live.push(...toDailyRows(await dailyRowsOf(context, each)));
		const merged = mergeToday({
			past: snapshot?.summary,
			today: live,
			from,
			todayDay: day,
			top: SNAPSHOT_TOP,
		});
		const shown: ShownViewSummary = {
			...merged,
			pages: await labelled(context, merged.pages),
			entities: await labelled(context, merged.entities),
		};
		return { days, builtAt: snapshot?.builtAt ?? null, summary: shown };
	},
});
