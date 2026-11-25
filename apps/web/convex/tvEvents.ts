// The slides events put on the TV (lib/tv/eventSlideSource.ts). Default
// runtime: a page of about 30 KB, two fonts and one copied picture (8 MiB at
// most) fit a default action, so queries, mutations and the action share
// this file.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { deleteIfUnheld } from "./lib/tv/boardUpload.ts";
import { isEventSlide } from "./lib/tv/configEdits.ts";
import {
	isAwaitingMigration,
	packAssets,
	readConfig,
} from "./lib/tv/configStore.ts";
import { TV_LIMITS } from "./lib/tv/constants.ts";
import { fontBytes } from "./lib/tv/eventSlideFiles.ts";
import {
	type CommitOutcome,
	commitEventSlideFiles,
	discardStored,
	type EventSlideSource,
	eventSlideSource,
	type OnSource,
	removeEventFromTv,
	type StoredFile,
	sizesByPath,
	wantedPaths,
} from "./lib/tv/eventSlideSource.ts";
import {
	cancelTransitions,
	scheduleTransitions,
} from "./lib/tv/eventTransitions.ts";
import { setTvStatus } from "./lib/tv/eventTvStatus.ts";
import { HTML_CONTENT_TYPE } from "./lib/tv/packPaths.ts";

function logFull(eventId: string, reason: string): void {
	// eslint-disable-next-line no-console -- the operator reads a skipped event slide in the Convex logs
	console.warn(`tvEvents: event ${eventId} is not on the TV: ${reason}`);
}

/**
 * Puts the event on the TV or takes it off, from what it is now, and keeps
 * its transition syncs (start, end, cutoff) at its current times.
 * Idempotent: any number of runs converge.
 */
export const syncEventSlide = internalMutation({
	args: { eventId: v.id("events") },
	handler: async (context, { eventId }): Promise<void> => {
		const now = Date.now();
		const source = await eventSlideSource(context, eventId, now);
		const event = await context.db.get(eventId);
		// Before the migration nothing may write the config; the cron retries.
		if (source.kind === "waiting") {
			if (event?.showOnTv === true)
				await setTvStatus(context, eventId, "waiting");
			return;
		}
		if (source.kind === "off") {
			if (event) await cancelTransitions(context, event);
			await removeEventFromTv(context, eventId);
			await setTvStatus(context, eventId, undefined);
			return;
		}
		if (event) await scheduleTransitions(context, event, now);
		if (source.kind === "on")
			await context.scheduler.runAfter(
				0,
				internal.tvEvents.renderEventSlide,
				{ eventId }
			);
		else {
			// A slide that cannot be refreshed must not keep showing the old date or name.
			await removeEventFromTv(context, eventId);
			await setTvStatus(context, eventId, "full", source.reason);
			logFull(eventId, source.reason);
		}
	},
});

/**
 * What `renderEventSlide` should store (an action has no database of its own).
 * It reads the clock in a query: Convex may reuse a cached result while what
 * it read is unchanged, but every sync patches the event (`scheduleTransitions`
 * stores new job ids) right before it schedules the render, so the render's
 * call always recomputes.
 */
export const eventSlidePlan = internalQuery({
	args: { eventId: v.id("events") },
	handler: (context, { eventId }): Promise<EventSlideSource> =>
		eventSlideSource(context, eventId, Date.now()),
});

const storedFile = v.object({
	path: v.string(),
	fileId: v.id("_storage"),
	size: v.number(),
	contentType: v.string(),
});

/** Deletes blobs a render stored, each unless a holder has it (the held check and the delete are one transaction). */
export const discardEventBlobs = internalMutation({
	args: { fileIds: v.array(v.id("_storage")) },
	handler: async (context, { fileIds }): Promise<void> => {
		for (const fileId of fileIds) await deleteIfUnheld(context, fileId);
	},
});

/** Takes a render into the pack, or says why not ("stale": a newer sync is on its way). */
export const commitEventSlide = internalMutation({
	args: {
		eventId: v.id("events"),
		html: v.string(),
		files: v.array(storedFile),
	},
	handler: (context, args): Promise<CommitOutcome> =>
		commitEventSlideFiles(context, args.eventId, args.html, args.files),
});

async function storeFile(
	context: ActionCtx,
	path: string,
	blob: Blob,
	contentType: string
): Promise<StoredFile> {
	const fileId = await context.storage.store(
		new Blob([blob], { type: contentType })
	);
	return { path, fileId, size: blob.size, contentType };
}

async function currentPage(
	context: ActionCtx,
	source: OnSource
): Promise<string | undefined> {
	const row = source.owned.find(
		(file) => file.path === source.slide.src && !file.isGone
	);
	if (row === undefined) return undefined;
	const blob = await context.storage.get(row.fileId);
	return blob === null ? undefined : blob.text();
}

/** Stores the page when its text changed, and each file the event does not hold yet at its size. */
async function storeChanged(
	context: ActionCtx,
	source: OnSource,
	stored: StoredFile[]
): Promise<void> {
	if ((await currentPage(context, source)) !== source.html)
		stored.push(
			await storeFile(
				context,
				source.slide.src,
				new Blob([source.html]),
				HTML_CONTENT_TYPE
			)
		);
	const owned = sizesByPath(source.owned.filter((file) => !file.isGone));
	for (const file of source.files) {
		if (owned.get(file.path) === file.size) continue;
		const blob =
			"font" in file.origin
				? new Blob([fontBytes(file.origin.font).slice().buffer])
				: await context.storage.get(file.origin.copyOf);
		// A picture deleted since the plan: the commit sees a changed event and refuses.
		if (blob !== null)
			stored.push(
				await storeFile(context, file.path, blob, file.contentType)
			);
	}
}

function needsCommit(source: OnSource, stored: StoredFile[]): boolean {
	const wanted = wantedPaths(source.slide.src, source.files);
	return (
		stored.length > 0 ||
		!source.isListed ||
		source.owned.some((file) => !wanted.has(file.path))
	);
}

/** Renders the event's slide and commits what changed; an unchanged event writes nothing. */
export const renderEventSlide = internalAction({
	args: { eventId: v.id("events") },
	handler: async (context, { eventId }): Promise<void> => {
		const source = await context.runQuery(
			internal.tvEvents.eventSlidePlan,
			{
				eventId,
			}
		);
		// Full now (the pack filled since the sync): take the event off rather than leave an old slide.
		if (source.kind === "full")
			await context.runMutation(internal.tvEvents.syncEventSlide, {
				eventId,
			});
		// Off or waiting now: whatever changed since scheduled its own sync.
		if (source.kind !== "on") return;
		const stored: StoredFile[] = [];
		let outcome: CommitOutcome | undefined;
		try {
			await storeChanged(context, source, stored);
			if (!needsCommit(source, stored)) return;
			outcome = await context.runMutation(
				internal.tvEvents.commitEventSlide,
				{ eventId, html: source.html, files: stored }
			);
		} finally {
			// A stored file the commit did not take belongs to no one, unless the
			// commit landed and only its reply was lost (outcome unknown): a
			// holder keeps its blob.
			if (outcome !== "committed")
				await discardStored(
					(fileIds) =>
						context.runMutation(
							internal.tvEvents.discardEventBlobs,
							{
								fileIds,
							}
						),
					stored
				);
		}
		// "stale": a newer sync is on its way. The transition syncs cover phase
		// changes; a non-event write that changes the fit between plan and
		// commit is caught by the periodic reconcile (`reconcileEventSlides`, daily). No
		// follow-up sync is scheduled here: nothing bounds it, so a render that
		// stays stale would loop.
		if (outcome === "full")
			logFull(eventId, "the pack filled up while the slide rendered");
	},
});

/** The newest events with "Show on TV" a reconcile looks at (older ones are past their cutoff or already in the config). */
const RECONCILE_EVENTS_MAX = TV_LIMITS.maxSlides;
/** Syncs are spread out so they do not all write the config at once. */
const RECONCILE_SPACING_MS = 1_000;

/**
 * Daily (crons.ts): syncs every event the TV knows of, so events past their
 * cutoff leave and a missed sync is repaired (including a render that was
 * refused as stale, which schedules no follow-up). An unchanged event renders
 * to the page it already has and writes nothing.
 *
 * It re-syncs every on-TV event each day, up to RECONCILE_EVENTS_MAX and past ones included.
 * That costs one render per on-TV event per day by design: bounded, and
 * idempotent (an unchanged page writes nothing).
 */
export const reconcileEventSlides = internalMutation({
	args: {},
	handler: async (context): Promise<void> => {
		const { config, isSaved } = await readConfig(context.db);
		if (await isAwaitingMigration(context.db, isSaved)) return;
		const ids = new Set<string>();
		for (const slide of config.slides)
			if (isEventSlide(slide) && slide.event !== undefined)
				ids.add(slide.event);
		const assets = await packAssets(context.db);
		for (const asset of assets)
			if (asset.sourceEventId !== undefined) ids.add(asset.sourceEventId);
		const shown = await context.db
			.query("events")
			.withIndex("by_showOnTv", (range) => range.eq("showOnTv", true))
			.order("desc")
			.take(RECONCILE_EVENTS_MAX);
		for (const event of shown) ids.add(event._id);
		let delay = 0;
		for (const raw of ids) {
			const eventId = context.db.normalizeId("events", raw);
			if (eventId === null) {
				await removeEventFromTv(context, raw);
				continue;
			}
			await context.scheduler.runAfter(
				delay,
				internal.tvEvents.syncEventSlide,
				{ eventId }
			);
			delay += RECONCILE_SPACING_MS;
		}
	},
});

/** Events retried per run, one second apart (the same spacing as the daily reconcile). */
const RETRY_EVENTS_MAX = 20;

/**
 * Scheduled by a manual write to the pack (`lib/tv/eventRetry`): syncs the
 * events left off the TV for want of room, now that the board may have freed
 * some. An event that still does not fit stays "full"; nothing reschedules
 * this (only another manual write does), so it cannot loop.
 */
export const retryFullEvents = internalMutation({
	args: {},
	handler: async (context): Promise<void> => {
		const full = await context.db
			.query("events")
			.withIndex("by_tvStatus", (range) => range.eq("tvStatus", "full"))
			.take(RETRY_EVENTS_MAX);
		let delay = 0;
		for (const event of full) {
			await context.scheduler.runAfter(
				delay,
				internal.tvEvents.syncEventSlide,
				{ eventId: event._id }
			);
			delay += RECONCILE_SPACING_MS;
		}
	},
});
