import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	query,
	type ActionCtx,
	type DatabaseReader,
	type MutationCtx,
} from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { DAY_MS } from "./lib/constants.ts";
import { occupancyErrorDetail } from "./lib/errors/occupancy.ts";
import { clampCount, dayKey, dayStartAfter } from "./lib/occupancy/accrual.ts";
import { CAPACITY } from "./lib/occupancy/index.ts";
import type { OccupancyProvider } from "./lib/occupancy/provider.ts";
import {
	occupancyUpdate,
	type OccupancyUpdate,
} from "./lib/occupancy/update.ts";
import {
	occupancyEnabled,
	occupancyProvider,
} from "./lib/occupancyProviderEnv.ts";
import { unwrap } from "./lib/result.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import {
	SITE_TIMEZONE,
	formatZoned,
	zonedDate,
	zonedLocalFromEpoch,
	zonedTime,
} from "./lib/time.ts";
import { alertOnChange } from "./notify/alertOnChange.ts";
import { OCCUPANCY_ONLINE_ALERT_KEY } from "./opsAlerts.ts";

const MINUTE_MS = 60_000;
const ATTENDANCE_DAYS = 366;
const EVENT_BATCH = 500;

export type OccupancyAnswer =
	| { enabled: false }
	| { enabled: true; count: number | null; capacity: number };

export type AttendanceDay = WithoutSystemFields<Doc<"occupancyDays">>;

export type AttendanceAnswer =
	| { enabled: false }
	| { enabled: true; capacity: number; days: AttendanceDay[] };

function occupancyRow(context: { db: DatabaseReader }) {
	return context.db.query("occupancy").first();
}

/** When the site day of the stored count's last write ends. */
function dayEnd(current: Doc<"occupancy">): number {
	return dayStartAfter(dayKey(current.updatedAt));
}

async function dayRow(context: MutationCtx, day: string) {
	return context.db
		.query("occupancyDays")
		.withIndex("by_day", (index) => index.eq("day", day))
		.unique();
}

/** Upsert one day row by merging `change` into it; an empty change writes
 *  nothing. */
async function patchDay(
	context: MutationCtx,
	day: string,
	change: (row: AttendanceDay) => Partial<AttendanceDay>
): Promise<void> {
	const row = await dayRow(context, day);
	const base: AttendanceDay = row ?? {
		day,
		peak: 0,
		peakAt: 0,
		personMinutes: 0,
	};
	const patch = change(base);
	if (Object.keys(patch).length === 0) return;
	if (row) await context.db.patch(row._id, patch);
	else await context.db.insert("occupancyDays", { ...base, ...patch });
}

/**
 * Credit the stored count from where accrual stopped up to `to`. The count
 * belongs to its own site day, so crediting stops at that day's end. A
 * counter that has been silent past its `maxSilenceMs` is offline: its time
 * stops at `reportedAt + maxSilenceMs` instead of running on at the last
 * count.
 */
async function accrue(
	context: MutationCtx,
	current: Doc<"occupancy">,
	to: number
): Promise<void> {
	if (current.count === 0) return;
	const maxSilenceMs = occupancyProvider()?.maxSilenceMs;
	const silenceEnd =
		maxSilenceMs === undefined ? to : current.reportedAt + maxSilenceMs;
	const end = Math.min(to, silenceEnd, dayEnd(current));
	const ms = end - current.updatedAt;
	if (ms <= 0) return;
	await patchDay(context, dayKey(current.updatedAt), (row) => ({
		personMinutes: row.personMinutes + (current.count * ms) / MINUTE_MS,
	}));
}

async function seen(context: MutationCtx, eventId: string): Promise<boolean> {
	const row = await context.db
		.query("occupancyEvents")
		.withIndex("by_eventId", (index) => index.eq("eventId", eventId))
		.first();
	return row !== null;
}

async function writeReport(
	context: MutationCtx,
	current: Doc<"occupancy"> | null,
	count: number,
	at: number
): Promise<void> {
	if (!current) {
		await context.db.insert("occupancy", {
			count,
			updatedAt: at,
			reportedAt: at,
		});
		return;
	}
	await context.db.patch(current._id, {
		count,
		updatedAt: Math.max(at, current.updatedAt),
		reportedAt: Math.max(at, current.reportedAt),
		offline: undefined,
	});
}

/** Apply one update to the running tally; retried event ids change nothing. */
async function applyOne(
	context: MutationCtx,
	tally: { count: number; entries: number },
	update: OccupancyUpdate
): Promise<void> {
	if (update.type === "count") {
		tally.count = clampCount(update.count);
		return;
	}
	if (update.eventId !== undefined) {
		if (await seen(context, update.eventId)) return;
		await context.db.insert("occupancyEvents", { eventId: update.eventId });
	}
	tally.count = clampCount(tally.count + update.change);
	if (update.change === 1) tally.entries++;
}

/**
 * Every counter input lands here: the poll's absolute count and the webhook's
 * updates. Credits the time since the last write at the old count, applies
 * the updates in order (clamped at zero, retried event ids skipped), then
 * raises the day's peak. The first delivery of a new site day starts from an
 * empty space, like the reset.
 */
export const applyUpdates = internalMutation({
	args: { updates: v.array(occupancyUpdate), at: v.number() },
	handler: async (context, { updates, at }): Promise<null> => {
		const current = await occupancyRow(context);
		if (current) await accrue(context, current, at);
		const carried = current && at < dayEnd(current) ? current.count : 0;
		// Where the report lands, like `updatedAt`: a late delivery stamped
		// before the stored write counts for the stored write's day.
		const written = current ? Math.max(at, current.updatedAt) : at;
		const tally = { count: carried, entries: 0 };
		let highest = 0;
		for (const update of updates) {
			await applyOne(context, tally, update);
			highest = Math.max(highest, tally.count);
		}
		await patchDay(context, dayKey(written), (row) => ({
			...(highest > row.peak ? { peak: highest, peakAt: written } : {}),
			...(tally.entries > 0
				? { entries: (row.entries ?? 0) + tally.entries }
				: {}),
		}));
		await writeReport(context, current, tally.count, at);
		return null;
	},
});

async function purgeEventBatch(context: MutationCtx): Promise<void> {
	const cutoff = Date.now() - DAY_MS;
	const events = await context.db
		.query("occupancyEvents")
		.withIndex("by_creation_time", (index) =>
			index.lt("_creationTime", cutoff)
		)
		.take(EVENT_BATCH);
	for (const event of events) await context.db.delete(event._id);
	if (events.length === EVENT_BATCH) {
		await context.scheduler.runAfter(0, internal.occupancy.clearEvents, {});
	}
}

/** Deletes the next batch of event ids older than a day, rescheduling while
 *  batches fill. */
export const clearEvents = internalMutation({
	args: {},
	handler: async (context): Promise<null> => {
		await purgeEventBatch(context);
		return null;
	},
});

/**
 * Hourly. Once the stored count's site day is over: credit its evening, then
 * start from an empty space. Counters drift with missed events; nobody is in
 * at 04:00. Every other run changes nothing. Each run also deletes event ids
 * older than a day, in batches, rescheduling while a batch is full.
 */
export const resetDay = internalMutation({
	args: {},
	handler: async (context): Promise<null> => {
		const now = Date.now();
		const current = await occupancyRow(context);
		if (current && now >= dayEnd(current)) {
			await accrue(context, current, now);
			// Not `reportedAt`: the reset is not a report, so it must not make
			// a silent counter look online.
			await context.db.patch(current._id, { count: 0, updatedAt: now });
		}
		await purgeEventBatch(context);
		return null;
	},
});

/**
 * The poll's offline check: whether the counter has been silent for longer
 * than `maxSilenceMs`. Stores the answer, so `current` shows an offline
 * counter as unknown; the next report clears it.
 */
export const recordSilence = internalMutation({
	args: { maxSilenceMs: v.number() },
	handler: async (
		context,
		{ maxSilenceMs }
	): Promise<{ reportedAt: number | null; isOffline: boolean }> => {
		const row = await occupancyRow(context);
		if (!row) return { reportedAt: null, isOffline: true };
		const isOffline = Date.now() - row.reportedAt > maxSilenceMs;
		if (isOffline !== (row.offline === true)) {
			await context.db.patch(row._id, {
				offline: isOffline ? true : undefined,
			});
		}
		return { reportedAt: row.reportedAt, isOffline };
	},
});

async function readAndApply(
	context: ActionCtx,
	provider: OccupancyProvider
): Promise<void> {
	if (!provider.readCount) return;
	const result = await provider.readCount();
	if (result.isErr()) {
		// eslint-disable-next-line no-console -- the operator reads a failed counter read in the Convex logs
		console.warn(`[occupancy-poll] ${occupancyErrorDetail(result.error)}`);
		return;
	}
	await context.runMutation(internal.occupancy.applyUpdates, {
		updates: [{ type: "count", count: result.value }],
		at: Date.now(),
	});
}

/** When the counter last reported: the time today, the date otherwise. */
function lastSeen(reportedAt: number | null, now: number): string {
	if (reportedAt === null) return "No report yet.";
	const local = zonedLocalFromEpoch(reportedAt, SITE_TIMEZONE);
	const today = zonedDate(zonedLocalFromEpoch(now, SITE_TIMEZONE));
	const when =
		zonedDate(local) === today ? zonedTime(local) : formatZoned(local);
	return `No report since ${when}.`;
}

/** Tell the board when a counter with a silence limit goes quiet or returns. */
async function checkSilence(
	context: ActionCtx,
	provider: OccupancyProvider
): Promise<void> {
	if (provider.maxSilenceMs === undefined) return;
	const { reportedAt, isOffline } = await context.runMutation(
		internal.occupancy.recordSilence,
		{ maxSilenceMs: provider.maxSilenceMs }
	);
	await alertOnChange(context, {
		key: OCCUPANCY_ONLINE_ALERT_KEY,
		fingerprint: isOffline ? "offline" : "",
		kind: "occupancyAlert",
		payloadFor: (decision) =>
			decision === "resolved"
				? {
						title: "Occupancy counter back online",
						body: "Reports are coming in again. Nothing to do.",
						tag: OCCUPANCY_ONLINE_ALERT_KEY,
					}
				: {
						title: "Occupancy counter offline",
						body: `${lastSeen(reportedAt, Date.now())} Attendance hours are paused until it reports again. Check its power and Wi-Fi.`,
						tag: OCCUPANCY_ONLINE_ALERT_KEY,
					},
	});
}

/**
 * Every 5 minutes: read the counter's headcount, when the installed counter
 * can be polled, then check it is still reporting. A failed read is logged
 * and skipped; the next tick tries again. No-op with no counter installed.
 */
export const poll = internalAction({
	args: {},
	handler: async (context): Promise<null> => {
		const provider = occupancyProvider();
		if (provider) {
			await readAndApply(context, provider);
			await checkSilence(context, provider);
		}
		return null;
	},
});

/** Current occupancy for the Space tab. Disabled when no counter exists;
 *  unknown before the first report and while the counter is offline. */
export const current = query({
	args: {},
	handler: async (context): Promise<OccupancyAnswer> => {
		unwrap(await requireRole(context, COMMUNITY_TIERS));
		if (!occupancyEnabled()) return { enabled: false };
		const row = await occupancyRow(context);
		// A stored flag only means something while the provider can go
		// silent; after a switch to one that cannot, it is stale.
		const isOffline =
			row?.offline === true &&
			occupancyProvider()?.maxSilenceMs !== undefined;
		return {
			enabled: true,
			count: row && !isOffline ? row.count : null,
			capacity: CAPACITY,
		};
	},
});

/** The last year of daily attendance, for the board's Insights tab. */
export const attendance = query({
	args: {},
	handler: async (context): Promise<AttendanceAnswer> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		if (!occupancyEnabled()) return { enabled: false };
		const since = dayKey(Date.now() - ATTENDANCE_DAYS * DAY_MS);
		const rows = await context.db
			.query("occupancyDays")
			.withIndex("by_day", (index) => index.gte("day", since))
			.take(ATTENDANCE_DAYS + 1);
		return {
			enabled: true,
			capacity: CAPACITY,
			days: rows.map(({ day, peak, peakAt, personMinutes, entries }) => ({
				day,
				peak,
				peakAt,
				personMinutes,
				entries,
			})),
		};
	},
});
