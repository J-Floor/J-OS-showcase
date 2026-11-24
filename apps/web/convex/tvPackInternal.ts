// Default runtime: the queries and mutations `tvPack.ts` ("use node") calls.
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { tvMessages } from "./lib/errors/tv.ts";
import { invariant, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { isBlobHeld } from "./lib/tv/blobHeld.ts";
import {
	deleteBlob,
	deleteIfUnheld,
	discardUnheldUpload,
} from "./lib/tv/boardUpload.ts";
import { missingFromPack, withEventSlides } from "./lib/tv/configEdits.ts";
import {
	isAwaitingMigration,
	fitsPack,
	isPackSizeOk,
	packAssets,
	readConfig,
	vanishedAssetPaths,
	writeConfig,
} from "./lib/tv/configStore.ts";
import { parseConfigXml } from "./lib/tv/configXml.ts";
import {
	TV_LIMITS,
	TV_PACK_LIMITS,
	TV_PACK_ZIP_TYPES,
} from "./lib/tv/constants.ts";
import { htmlTotal } from "./lib/tv/slideChecks.ts";

/** What `buildPack` zips: the saved XML and every pack file, or null before the first save. `isOverLimit`: too many files or bytes to zip. `missing`: paths whose blob is gone from storage. */
export const packSource = internalQuery({
	args: {},
	handler: async (context) => {
		const row = await context.db.query("tvConfig").first();
		if (row?.xml === undefined) return null;
		const assets = await packAssets(context.db);
		return {
			version: row.version,
			// config.xml is an entry of the zip too.
			isOverLimit:
				!fitsPack(assets.length) ||
				!isPackSizeOk(assets.map((asset) => asset.size)),
			missing: await vanishedAssetPaths(context.db),
			xml: row.xml,
			assets: assets.map((asset) => ({
				path: asset.path,
				fileId: asset.fileId,
			})),
		};
	},
});

/**
 * Records a built pack when it is still for the current version (then the
 * previous pack blob is deleted); otherwise deletes the new blob, since a
 * newer build is already scheduled.
 */
export const setPack = internalMutation({
	args: { version: v.number(), packFileId: v.id("_storage") },
	handler: async (context, args): Promise<boolean> => {
		const row = await context.db.query("tvConfig").first();
		if (row?.version !== args.version) {
			await deleteBlob(context, args.packFileId);
			return false;
		}
		if (row.packFileId !== undefined)
			await deleteBlob(context, row.packFileId);
		await context.db.patch(row._id, {
			packFileId: args.packFileId,
			packVersion: args.version,
		});
		return true;
	},
});

/** The live pack blob, for `buildPack` to tell a committed `setPack` from a failed one. */
export const livePackFileId = internalQuery({
	args: {},
	handler: async (context): Promise<Id<"_storage"> | null> => {
		const row = await context.db.query("tvConfig").first();
		return row?.packFileId ?? null;
	},
});

/** The board gate `importPack` runs first (an action has no database of its own). */
export const requireBoard = internalQuery({
	args: {},
	handler: async (context): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		return null;
	},
});

const packFile = v.object({
	path: v.string(),
	fileId: v.id("_storage"),
	size: v.number(),
	contentType: v.string(),
});

/** What importing a pack came to: done, or the problems to show. */
export type ImportOutcome = { ok: true } | { ok: false; problems: string[] };

/**
 * What `importPack` may do with an uploaded blob, decided before it is
 * downloaded or deleted: null when it is gone, `isImportable: false` when the
 * blob is not a zip upload or something already holds it. `isBlobHeld` covers
 * pictures, slide files and pack files but not signed agreements, so the content
 * type check is what keeps those (PDFs) from being read and deleted.
 */
export const inspectUpload = internalQuery({
	args: { storageId: v.id("_storage") },
	handler: async (context, args) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const blob = await context.db.system.get("_storage", args.storageId);
		if (blob === null) return null;
		return {
			size: blob.size,
			// `isBlobHeld` also knows the live pack zip.
			isImportable:
				TV_PACK_ZIP_TYPES.has(blob.contentType ?? "") &&
				!(await isBlobHeld(context, args.storageId)),
		};
	},
});

/** Drops the uploaded zip once `importPack` is done with it, unless something holds it by then (the check and the delete are one transaction). */
export const dropUpload = internalMutation({
	args: { storageId: v.id("_storage") },
	handler: async (context, args): Promise<null> => {
		await discardUnheldUpload(context, args.storageId);
		return null;
	},
});

/** True when any of these blobs is held (after a lost response: did the swap commit?). */
export const holdsAnyBlob = internalQuery({
	args: { fileIds: v.array(v.id("_storage")) },
	handler: async (context, args): Promise<boolean> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		for (const fileId of args.fileIds)
			if (await isBlobHeld(context, fileId)) return true;
		return false;
	},
});

/** The HTML total and the whole-pack size of these files (what a pack would hold). */
function sizeProblems(
	files: { contentType: string; size: number }[]
): string[] {
	return [
		...(htmlTotal(files) > TV_LIMITS.htmlTotalMax
			? [tvMessages.TvHtmlTooLarge]
			: []),
		...(isPackSizeOk(files.map((row) => row.size))
			? []
			: [tvMessages.TvPackTooLarge]),
	];
}

/**
 * Swaps in an imported pack in one transaction: every manual pack file is
 * deleted (row, and blob unless something else holds it), the imported
 * files are inserted, and the config becomes the imported one plus the
 * event slides already on the TV. Event files (`sourceEventId`) are never
 * touched. Paths stay unique (`tvAssets.by_path` is an index, not a
 * constraint, so it is enforced here). Problems come back as a value so
 * the action can delete the files it stored.
 */
export const replacePack = internalMutation({
	args: { xml: v.string(), assets: v.array(packFile) },
	handler: async (context, args): Promise<ImportOutcome> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const imported = parseConfigXml(args.xml);
		invariant(imported.isOk(), "importPack passed unparsed XML");
		const { config: current, isSaved } = await readConfig(context.db);
		if (await isAwaitingMigration(context.db, isSaved))
			return { ok: false, problems: [tvMessages.TvConfigNotMigrated] };
		const existing = await packAssets(context.db);
		const eventPaths = new Set(
			existing
				.filter((row) => row.sourceEventId !== undefined)
				.map((row) => row.path)
		);
		const problems = args.assets
			.filter((asset) => eventPaths.has(asset.path))
			.map((asset) => `${asset.path} belongs to an event slide.`);
		const importedPaths = new Set(args.assets.map((asset) => asset.path));
		if (importedPaths.size !== args.assets.length)
			problems.push("The pack lists a file path twice.");
		problems.push(...missingFromPack(imported.value, importedPaths));
		if (!fitsPack(eventPaths.size + args.assets.length))
			problems.push(
				`A pack can hold at most ${String(TV_PACK_LIMITS.maxFiles)} files, event slides included.`
			);
		// Imported files plus the event files that stay; replaced rows go away.
		const kept = existing.filter((row) => row.sourceEventId !== undefined);
		problems.push(...sizeProblems([...args.assets, ...kept]));
		if (problems.length > 0) return { ok: false, problems };
		const merged = withEventSlides(imported.value, current);
		if (merged.isErr()) return { ok: false, problems: merged.error };
		const replaced = existing.filter(
			(row) => row.sourceEventId === undefined
		);
		for (const row of replaced) await context.db.delete(row._id);
		for (const asset of args.assets)
			await context.db.insert("tvAssets", asset);
		// After the swap, so "a remaining pack file holds it" sees the new rows.
		for (const row of replaced) await deleteIfUnheld(context, row.fileId);
		await writeConfig(context, merged.value);
		return { ok: true };
	},
});
