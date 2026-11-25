// Board-only reads and edits of the TV's config.xml pack. `tv.ts` keeps the
// legacy tvSlides API (removed in a cleanup PR) and the TV devices.
import { v } from "convex/values";

import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import {
	appendSlide,
	eventSlideProblems,
	isEventSlide,
	missingSources,
	moveSlide,
	nextSlideId,
	removeSlide,
	reorderSlides,
	setSlideFields,
} from "./lib/tv/configEdits.ts";
import {
	editConfig,
	isAwaitingMigration,
	packAssets,
	readConfig,
	vanishedAssetPaths,
} from "./lib/tv/configStore.ts";
import {
	describeProblem,
	parseConfigXml,
	serializeConfig,
	type TvConfig,
	type TvConfigSlide,
} from "./lib/tv/configXml.ts";
import { TV_LIMITS } from "./lib/tv/constants.ts";
import { isAssetPath } from "./lib/tv/packPaths.ts";
import { readTvConfig } from "./lib/tv/queries.ts";
import { checkDuration, cleanTitle } from "./lib/tv/slideChecks.ts";
import { assetAt, checkReplacement, putFile } from "./lib/tv/slideFiles.ts";

const slideKind = v.union(v.literal("image"), v.literal("html"));

async function eventName(
	context: QueryCtx,
	slide: TvConfigSlide
): Promise<string | undefined> {
	if (slide.event === undefined) return undefined;
	const id = context.db.normalizeId("events", slide.event);
	if (id === null) return undefined;
	const event = await context.db.get(id);
	return event?.name;
}

async function slideOrRefuse(
	context: QueryCtx,
	id: string
): Promise<{ slide: TvConfigSlide; config: TvConfig }> {
	const { config } = await readConfig(context.db);
	const slide = config.slides.find((candidate) => candidate.id === id);
	if (!slide) refuse({ type: "TvSlideNotFound" });
	return { slide, config };
}

function row(slide: TvConfigSlide) {
	return {
		_id: slide.id,
		title: slide.title ?? slide.id,
		kind: slide.type,
		durationSec: slide.duration,
		enabled: slide.enabled,
		fromEvent: isEventSlide(slide),
	};
}

async function assetPaths(context: QueryCtx): Promise<Set<string>> {
	const assets = await packAssets(context.db);
	return new Set(assets.map((asset) => asset.path));
}

/** Board-only: the slides in show order, as the list shows them. */
export const listConfigSlides = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const { config } = await readConfig(context.db);
		const paths = await assetPaths(context);
		const vanished = new Set(await vanishedAssetPaths(context.db));
		return Promise.all(
			config.slides.map(async (slide) => ({
				...row(slide),
				eventName: await eventName(context, slide),
				isMissing: !paths.has(slide.src) || vanished.has(slide.src),
			}))
		);
	},
});

/** Board-only: one slide and a URL to its file (the sheet loads HTML from it); null for an id that is gone (a sheet may be open on a slide just deleted). */
export const getConfigSlide = query({
	args: { id: v.string() },
	handler: async (context, args) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const { config } = await readConfig(context.db);
		const slide = config.slides.find((other) => other.id === args.id);
		if (!slide) return null;
		const asset = await assetAt(context, slide.src);
		const url =
			asset === null ? null : await context.storage.getUrl(asset.fileId);
		return { ...row(slide), isMissing: url === null, url };
	},
});

/** Board-only: config.xml as saved (an empty show before the first save), the built pack, and whether the legacy slides still await the migration. */
export const getPackState = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const row = await context.db.query("tvConfig").first();
		const { config, isSaved } = await readConfig(context.db);
		const { version, packVersion } = await readTvConfig(context.db);
		return {
			xml: row?.xml ?? serializeConfig(config),
			// Legacy slides not yet moved: `config` is empty and writes are refused.
			isAwaitingMigration: await isAwaitingMigration(context.db, isSaved),
			version,
			packVersion,
			// Pack files whose blob is gone: a build cannot zip them until they are replaced.
			missingAssets: await vanishedAssetPaths(context.db),
			packUrl:
				row?.packFileId === undefined
					? null
					: await context.storage.getUrl(row.packFileId),
		};
	},
});

/** Board-only: what the TV shows now: enabled slides with file URLs, and the assets HTML slides may use. */
export const previewPack = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const { config } = await readConfig(context.db);
		const assets = await packAssets(context.db);
		const urls = new Map(
			await Promise.all(
				assets.map(
					async (asset) =>
						[
							asset.path,
							await context.storage.getUrl(asset.fileId),
						] as const
				)
			)
		);
		const slides = config.slides.flatMap((slide) => {
			const url = urls.get(slide.src);
			return slide.enabled && url
				? [
						{
							id: slide.id,
							kind: slide.type,
							durationSec: slide.duration,
							url,
						},
					]
				: [];
		});
		return {
			transition: config.transition,
			slides,
			assets: assets.flatMap((asset) => {
				const url = urls.get(asset.path);
				return isAssetPath(asset.path) && url
					? [{ path: asset.path, url }]
					: [];
			}),
		};
	},
});

/**
 * Board-only: the live config.xml editor. Content problems come back as
 * lines to show, not as a refusal; a save over a newer version is refused.
 */
export const saveConfigXml = mutation({
	args: { xml: v.string(), expectedVersion: v.number() },
	handler: async (
		context,
		args
	): Promise<
		{ ok: true; version: number } | { ok: false; problems: string[] }
	> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const { version } = await readTvConfig(context.db);
		if (version !== args.expectedVersion) refuse({ type: "TvConfigStale" });
		const { config: saved, isSaved } = await readConfig(context.db);
		if (await isAwaitingMigration(context.db, isSaved))
			refuse({ type: "TvConfigNotMigrated" });
		const parsed = parseConfigXml(args.xml);
		if (parsed.isErr())
			return {
				ok: false,
				problems: parsed.error.map((problem) =>
					describeProblem(problem)
				),
			};
		const paths = await assetPaths(context);
		const problems = [
			...missingSources(parsed.value, paths),
			...eventSlideProblems(saved, parsed.value),
		];
		if (problems.length > 0)
			return {
				ok: false,
				problems: problems.map((problem) => describeProblem(problem)),
			};
		return {
			ok: true,
			version: await editConfig(context, () => parsed.value),
		};
	},
});

/** Board-only: a new slide at the end, from an uploaded image or HTML file. */
export const addConfigSlide = mutation({
	args: {
		title: v.string(),
		kind: slideKind,
		fileId: v.id("_storage"),
		durationSec: v.optional(v.number()),
	},
	handler: async (context, args): Promise<string> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const title = cleanTitle(args.title);
		const duration = args.durationSec ?? TV_LIMITS.durationDefault;
		checkDuration(duration);
		const { config } = await readConfig(context.db);
		const id = nextSlideId(config);
		const { path: source, file } = await checkReplacement(context, config, {
			id,
			type: args.kind,
			fileId: args.fileId,
		});
		await editConfig(context, (current) =>
			unwrap(
				appendSlide(current, {
					id,
					type: args.kind,
					src: source,
					duration,
					enabled: true,
					title,
				})
			)
		);
		await putFile(context, source, file);
		return id;
	},
});

/** Board-only: edit a manual slide; a new file replaces the old one (whose blob is deleted). An event's slide takes only a new `durationSec`. */
export const updateConfigSlide = mutation({
	args: {
		id: v.string(),
		title: v.optional(v.string()),
		durationSec: v.optional(v.number()),
		enabled: v.optional(v.boolean()),
		fileId: v.optional(v.id("_storage")),
	},
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const { slide, config } = await slideOrRefuse(context, args.id);
		if (args.durationSec !== undefined) checkDuration(args.durationSec);
		const title =
			args.title === undefined ? undefined : cleanTitle(args.title);
		const replacement =
			args.fileId === undefined
				? undefined
				: await checkReplacement(context, config, {
						id: slide.id,
						type: slide.type,
						fileId: args.fileId,
						owner: slide.id,
					});
		await editConfig(context, (current) =>
			unwrap(
				setSlideFields(current, args.id, {
					title,
					duration: args.durationSec,
					enabled: args.enabled,
					src: replacement?.path,
				})
			)
		);
		if (replacement)
			await putFile(context, replacement.path, replacement.file);
		return null;
	},
});

/** Board-only: swap a slide, an event's included, with its neighbour; a no-op at the ends. */
export const moveConfigSlide = mutation({
	args: {
		id: v.string(),
		direction: v.union(v.literal("up"), v.literal("down")),
	},
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await editConfig(context, (current) =>
			unwrap(moveSlide(current, args.id, args.direction))
		);
		return null;
	},
});

/** Board-only: put every slide in the order of `ids` (the current ids, each once); event slides included. */
export const reorderConfigSlides = mutation({
	args: { ids: v.array(v.string()) },
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await editConfig(context, (current) =>
			unwrap(reorderSlides(current, args.ids))
		);
		return null;
	},
});

/** Board-only: remove a manual slide; its file goes with the next save's prune. */
export const removeConfigSlide = mutation({
	args: { id: v.string() },
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await editConfig(context, (current) =>
			unwrap(removeSlide(current, args.id))
		);
		return null;
	},
});
