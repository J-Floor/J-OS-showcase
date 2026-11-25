import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

import { deleteIfUnheld } from "./boardUpload.ts";
import {
	type EventSlide,
	removeEventSlides,
	sameEventSlide,
	upsertEventSlide,
} from "./configEdits.ts";
import {
	fitsPack,
	isAwaitingMigration,
	isPackSizeOk,
	packAssets,
	readConfig,
	writeConfig,
} from "./configStore.ts";
import type { TvConfig } from "./configXml.ts";
import { TV_LIMITS } from "./constants.ts";
import { tvCutoff } from "./eventCutoff.ts";
import { eventSlideHtml } from "./eventSlide.ts";
import {
	EVENT_FONT_KEYS,
	type EventFontKey,
	eventSlideEntry,
	eventSlidePaths,
	fontSize,
} from "./eventSlideFiles.ts";
import { NO_PICTURE_DETAIL, setTvStatus } from "./eventTvStatus.ts";
import { htmlBytes } from "./htmlBytes.ts";
import { imageExtension, packContentType } from "./packPaths.ts";
import { htmlTotal } from "./slideChecks.ts";
import { putFile } from "./slideFiles.ts";

// What an event puts in the pack, decided from the live event. Shared by the
// sync (on or off), the render (what to store) and the commit (is the render
// still the event's page?). Every file here carries `sourceEventId`.

type Database = QueryCtx["db"];

/** Page, two fonts, picture, and room for a stale picture a commit replaces. */
const EVENT_FILES_MAX = 8;

export type EventFileSpec = {
	path: string;
	contentType: string;
	size: number;
	/** Where the render gets the bytes: an embedded font, or a copy of the event's picture. */
	origin: { font: EventFontKey } | { copyOf: Id<"_storage"> };
};

export type OwnedFile = {
	path: string;
	fileId: Id<"_storage">;
	size: number;
	/** The row's blob has vanished from storage: it counts as missing, so the render stores it again. */
	isGone: boolean;
};

export type OnSource = {
	kind: "on";
	slide: EventSlide;
	html: string;
	files: EventFileSpec[];
	owned: OwnedFile[];
	/** The event has a usable picture that did not fit: the page shows the wordmark panel instead. */
	isPictureDropped: boolean;
	/** The config already holds exactly this slide entry. */
	isListed: boolean;
};

export type EventSlideSource =
	| { kind: "waiting" }
	| { kind: "off" }
	| { kind: "full"; reason: string }
	| OnSource;

export type StoredFile = {
	path: string;
	fileId: Id<"_storage">;
	size: number;
	contentType: string;
};

export type CommitOutcome = "committed" | "stale" | "full";

type Picture = {
	pictureId: Id<"_storage">;
	extension: string;
	size: number;
	contentType: string;
};

type Built = {
	html: string;
	files: EventFileSpec[];
	isPictureDropped: boolean;
};

function isEventOnTv(
	event: Pick<Doc<"events">, "showOnTv" | "endsAt" | "tvUntil">,
	now: number
): boolean {
	return event.showOnTv === true && now < tvCutoff(event);
}

/** `<SITE_URL origin>/visitor?event=<id>`; undefined when SITE_URL is unset or not a URL (that deployment's slide has no QR). */
export function eventSignUpUrl(eventId: string): string | undefined {
	const site = process.env.SITE_URL;
	if (!site) return undefined;
	try {
		return `${new URL(site).origin}/visitor?event=${eventId}`;
	} catch {
		return undefined;
	}
}

function ownedRows(database: Database, eventId: Id<"events">) {
	return database
		.query("tvAssets")
		.withIndex("by_sourceEvent", (range) =>
			range.eq("sourceEventId", eventId)
		)
		.take(EVENT_FILES_MAX);
}

async function pictureOf(
	database: Database,
	event: Doc<"events">
): Promise<Picture | undefined> {
	if (event.pictureId === undefined) return undefined;
	const meta = await database.system.get("_storage", event.pictureId);
	const contentType = meta?.contentType;
	const extension = imageExtension(contentType);
	if (meta === null || contentType === undefined || extension === undefined)
		return undefined;
	return {
		pictureId: event.pictureId,
		extension,
		size: meta.size,
		contentType,
	};
}

/** The page in its state at `now` (soon, live or past), and the files it uses. */
function build(
	event: Doc<"events">,
	picture: Picture | undefined,
	now: number
): Built {
	const paths = eventSlidePaths(event._id, picture);
	const html = eventSlideHtml(
		{
			name: event.name,
			description: event.description,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			startsAtLocal: event.startsAtLocal,
			endsAtLocal: event.endsAtLocal,
			paths,
			signUpUrl: eventSignUpUrl(event._id),
		},
		now
	);
	const fonts: EventFileSpec[] = EVENT_FONT_KEYS.map((key) => ({
		path: paths.fonts[key],
		contentType: packContentType(paths.fonts[key]),
		size: fontSize(key),
		origin: { font: key },
	}));
	if (picture === undefined || paths.picture === undefined)
		return { html, files: fonts, isPictureDropped: false };
	return {
		html,
		isPictureDropped: false,
		files: [
			...fonts,
			{
				path: paths.picture,
				contentType: picture.contentType,
				size: picture.size,
				origin: { copyOf: picture.pictureId },
			},
		],
	};
}

/** The page plus these files fit beside `others` (config.xml counts as a file). */
function fits(others: Doc<"tvAssets">[], built: Built): boolean {
	return (
		fitsPack(others.length + built.files.length + 1) &&
		htmlTotal(others) + htmlBytes(built.html) <= TV_LIMITS.htmlTotalMax &&
		isPackSizeOk([
			...others.map((asset) => asset.size),
			htmlBytes(built.html),
			...built.files.map((file) => file.size),
		])
	);
}

/** The event's page and files: with the picture when it fits, else with the wordmark; undefined when neither fits. */
function chooseBuild(
	event: Doc<"events">,
	picture: Picture | undefined,
	others: Doc<"tvAssets">[],
	now: number
): Built | undefined {
	const full = build(event, picture, now);
	if (fits(others, full)) return full;
	if (picture === undefined) return undefined;
	const plain = { ...build(event, undefined, now), isPictureDropped: true };
	return fits(others, plain) ? plain : undefined;
}

/** Why the slide cannot go in (a manual slide or file in its place, or a full TV), if so. */
function clash(
	config: TvConfig,
	slide: EventSlide,
	others: Doc<"tvAssets">[],
	built: Built
): string | undefined {
	const paths = wantedPaths(slide.src, built.files);
	const taken = others.find((asset) => paths.has(asset.path));
	if (taken) return `${taken.path} is a manual pack file`;
	const edit = upsertEventSlide(config, slide);
	if (!edit.isErr()) return undefined;
	return edit.error.type === "TvTooManySlides"
		? "the TV already shows the most slides it can"
		: `a manual slide has the id ${slide.id}`;
}

/** What the event should put in the pack now. */
export async function eventSlideSource(
	context: QueryCtx,
	eventId: Id<"events">,
	now: number
): Promise<EventSlideSource> {
	const { config, isSaved } = await readConfig(context.db);
	if (await isAwaitingMigration(context.db, isSaved))
		return { kind: "waiting" };
	const event = await context.db.get(eventId);
	if (event === null || !isEventOnTv(event, now)) return { kind: "off" };
	const assets = await packAssets(context.db);
	const others = assets.filter((asset) => asset.sourceEventId !== eventId);
	const built = chooseBuild(
		event,
		await pictureOf(context.db, event),
		others,
		now
	);
	if (built === undefined)
		return { kind: "full", reason: "the pack is full" };
	const slide = eventSlideEntry(eventId, event.name);
	const reason = clash(config, slide, others, built);
	if (reason !== undefined) return { kind: "full", reason };
	const owned = await ownedRows(context.db, eventId);
	const gone = await Promise.all(
		owned.map(
			async (row) =>
				(await context.db.system.get("_storage", row.fileId)) === null
		)
	);
	return {
		kind: "on",
		slide,
		html: built.html,
		files: built.files,
		isPictureDropped: built.isPictureDropped,
		owned: owned.map((row, index) => ({
			path: row.path,
			fileId: row.fileId,
			size: row.size,
			isGone: gone[index] ?? false,
		})),
		isListed: config.slides.some((other) => sameEventSlide(other, slide)),
	};
}

/** The pack paths of a slide: its page and its files. */
export function wantedPaths(
	source: string,
	files: readonly { path: string }[]
): Set<string> {
	return new Set([source, ...files.map((file) => file.path)]);
}

/** Each file's size by its path. */
export function sizesByPath(
	files: readonly { path: string; size: number }[]
): Map<string, number> {
	return new Map(files.map((file) => [file.path, file.size]));
}

/** Deletes the event's rows that the wanted set does not hold, then their blobs unless another holder still has them. */
async function dropOwned(
	context: MutationCtx,
	eventId: Id<"events">,
	keep: ReadonlySet<string>
): Promise<void> {
	const rows = await ownedRows(context.db, eventId);
	for (const row of rows) {
		if (keep.has(row.path)) continue;
		await context.db.delete(row._id);
		await deleteIfUnheld(context, row.fileId);
	}
}

/** Takes the event's slide and files off the TV. `eventId` may be any string a config named. */
export async function removeEventFromTv(
	context: MutationCtx,
	eventId: string
): Promise<void> {
	const { config, isSaved } = await readConfig(context.db);
	if (await isAwaitingMigration(context.db, isSaved)) return;
	const next = removeEventSlides(config, eventId);
	if (next.slides.length !== config.slides.length)
		await writeConfig(context, next, { byEvent: true });
	const id = context.db.normalizeId("events", eventId);
	if (id !== null) await dropOwned(context, id, new Set());
}

/** Every wanted path has a file of the wanted size (just stored, or already the event's), and nothing else was stored. */
function isComplete(
	source: OnSource,
	html: string,
	stored: StoredFile[]
): boolean {
	const wanted = wantedPaths(source.slide.src, source.files);
	const sizes = sizesByPath(source.files);
	sizes.set(source.slide.src, htmlBytes(html));
	const have = new Map([
		...sizesByPath(source.owned),
		...sizesByPath(stored),
	]);
	return (
		[...wanted].every((path) => have.get(path) === sizes.get(path)) &&
		stored.every((file) => wanted.has(file.path))
	);
}

/**
 * Takes a render's stored files into the pack, when the page is still the
 * one the live event renders to and every file is in place. Never deletes
 * the files it was handed when it refuses: the render does.
 */
export async function commitEventSlideFiles(
	context: MutationCtx,
	eventId: Id<"events">,
	html: string,
	stored: StoredFile[]
): Promise<CommitOutcome> {
	const source = await eventSlideSource(context, eventId, Date.now());
	if (source.kind === "full") {
		// An existing slide that cannot be refreshed must not show stale text.
		await removeEventFromTv(context, eventId);
		await setTvStatus(context, eventId, "full", source.reason);
		return "full";
	}
	if (
		source.kind !== "on" ||
		source.html !== html ||
		!isComplete(source, html, stored)
	)
		return "stale";
	const { config } = await readConfig(context.db);
	const next = upsertEventSlide(config, source.slide);
	if (next.isErr()) {
		await removeEventFromTv(context, eventId);
		await setTvStatus(
			context,
			eventId,
			"full",
			"the TV already shows the most slides it can"
		);
		return "full";
	}
	for (const file of stored)
		await putFile(context, file.path, {
			fileId: file.fileId,
			size: file.size,
			contentType: file.contentType,
			sourceEventId: eventId,
		});
	await dropOwned(
		context,
		eventId,
		wantedPaths(source.slide.src, source.files)
	);
	await writeConfig(context, next.value, { byEvent: true });
	await setTvStatus(
		context,
		eventId,
		"shown",
		source.isPictureDropped ? NO_PICTURE_DETAIL : undefined
	);
	if (source.isPictureDropped)
		// eslint-disable-next-line no-console -- the operator reads a slide shown without its picture in the Convex logs
		console.warn(
			`tvEvents: event ${eventId} is on the TV without its picture: the pack is nearly full`
		);
	return "committed";
}

/**
 * Discards the blobs a render stored without a commit taking them, through
 * `discard` (an atomic delete-unless-held). A thrown commit is not a failed
 * commit: its response may be what was lost, so only a blob nothing holds is
 * deleted. A failing discard keeps them (an orphan beats a broken slide) and
 * never throws, so it cannot hide the error that sent us here.
 */
export async function discardStored(
	discard: (fileIds: Id<"_storage">[]) => Promise<unknown>,
	stored: StoredFile[]
): Promise<void> {
	if (stored.length === 0) return;
	try {
		await discard(stored.map((file) => file.fileId));
	} catch {
		// Kept on purpose.
	}
}
