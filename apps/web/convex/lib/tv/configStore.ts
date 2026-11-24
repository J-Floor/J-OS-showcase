import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { invariant, refuse } from "../result.ts";

import { deleteIfUnheld } from "./boardUpload.ts";
import { parseConfigXml, serializeConfig, type TvConfig } from "./configXml.ts";
import {
	TV_DEFAULT_TRANSITION,
	TV_INITIAL_VERSION,
	TV_PACK_LIMITS,
} from "./constants.ts";
import { isSlidePath } from "./packPaths.ts";

type Database = QueryCtx["db"];

/** The singleton config row, inserted on first use. */
export async function ensureConfig(
	context: MutationCtx
): Promise<Doc<"tvConfig">> {
	const existing = await context.db.query("tvConfig").first();
	if (existing) return existing;
	const id = await context.db.insert("tvConfig", {
		transition: TV_DEFAULT_TRANSITION,
		version: TV_INITIAL_VERSION,
	});
	const created = await context.db.get(id);
	invariant(created, "tvConfig row missing right after insert");
	return created;
}

/** Every pack file. Imports refuse past `maxFiles`; one extra row makes an overshoot visible. */
export function packAssets(database: Database) {
	return database.query("tvAssets").take(TV_PACK_LIMITS.maxFiles + 1);
}

/** Bytes the zip may hold in files: the pack maximum less room for config.xml. */
export const PACK_FILE_BYTES_MAX =
	TV_PACK_LIMITS.packMaxBytes - TV_PACK_LIMITS.configMaxBytes;

/** True when `fileCount` pack files fit: config.xml is one more file of the `maxFiles`. */
export function fitsPack(fileCount: number): boolean {
	return fileCount + 1 <= TV_PACK_LIMITS.maxFiles;
}

/** True when the files' sizes (plus room for config.xml) fit in a pack. */
export function isPackSizeOk(sizes: Iterable<number>): boolean {
	let total = 0;
	for (const size of sizes) total += size;
	return total <= PACK_FILE_BYTES_MAX;
}

/** Refuses a write that would put `size` bytes at `path` and push the pack over its maximum; a file already at `path` is replaced, so its size is taken out. */
export function refuseOversizePack(
	assets: Doc<"tvAssets">[],
	path: string,
	size: number
): void {
	const others = assets
		.filter((asset) => asset.path !== path)
		.map((asset) => asset.size);
	if (!isPackSizeOk([...others, size])) refuse({ type: "TvPackTooLarge" });
}

/** Paths of pack files whose blob is gone from storage: a build cannot zip them. */
export async function vanishedAssetPaths(
	database: Database
): Promise<string[]> {
	const vanished: string[] = [];
	const assets = await packAssets(database);
	for (const asset of assets)
		if (!(await database.system.get("_storage", asset.fileId)))
			vanished.push(asset.path);
	return vanished;
}

/** The saved config, or an empty show before the first save. */
export async function readConfig(
	database: Database
): Promise<{ config: TvConfig; isSaved: boolean }> {
	const row = await database.query("tvConfig").first();
	if (row?.xml === undefined) {
		const transition = row?.transition ?? TV_DEFAULT_TRANSITION;
		return { config: { transition, slides: [] }, isSaved: false };
	}
	const parsed = parseConfigXml(row.xml);
	invariant(parsed.isOk(), "stored tvConfig.xml does not parse");
	return { config: parsed.value, isSaved: true };
}

/** True while `tvSlides` rows wait for `migrateTvSlidesToConfig`: a save now would drop them. */
export async function isAwaitingMigration(
	database: Database,
	isSaved: boolean
): Promise<boolean> {
	return !isSaved && (await database.query("tvSlides").first()) !== null;
}

/** `slides/` files no slide points at; `assets/` files stay (HTML may use them) and event files are PR C's. */
async function pruneSlideFiles(
	context: MutationCtx,
	config: TvConfig
): Promise<void> {
	const used = new Set(config.slides.map((slide) => slide.src));
	const rows = await packAssets(context.db);
	for (const row of rows) {
		const isUnused =
			row.sourceEventId === undefined &&
			isSlidePath(row.path) &&
			!used.has(row.path);
		if (!isUnused) continue;
		await context.db.delete(row._id);
		// Another holder (an event picture, a legacy slide, another pack row) keeps the blob.
		await deleteIfUnheld(context, row.fileId);
	}
}

/**
 * Saves `config` as canonical XML, bumps the version and schedules the pack
 * build (delayed, so a burst of edits builds once). Returns the new version.
 */
export async function writeConfig(
	context: MutationCtx,
	config: TvConfig
): Promise<number> {
	const xml = serializeConfig(config);
	const parsed = parseConfigXml(xml);
	if (parsed.isErr()) refuse({ type: "TvConfigInvalid" });
	const row = await ensureConfig(context);
	const version = row.version + 1;
	await context.db.patch(row._id, {
		xml,
		transition: config.transition,
		version,
	});
	await pruneSlideFiles(context, config);
	await context.scheduler.runAfter(
		TV_PACK_LIMITS.buildDelayMs,
		internal.tvPack.buildPack,
		{ version }
	);
	return version;
}

/**
 * A board edit of the saved config. Refused until the tvSlides migration has
 * run. An edit that returns the config it was given changes nothing: no
 * version bump, no build.
 */
export async function editConfig(
	context: MutationCtx,
	edit: (config: TvConfig) => TvConfig
): Promise<number> {
	const { config, isSaved } = await readConfig(context.db);
	if (await isAwaitingMigration(context.db, isSaved))
		refuse({ type: "TvConfigNotMigrated" });
	const edited = edit(config);
	if (edited === config) {
		const row = await context.db.query("tvConfig").first();
		return row?.version ?? TV_INITIAL_VERSION;
	}
	return writeConfig(context, edited);
}
