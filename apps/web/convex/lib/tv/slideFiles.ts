import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { refuse } from "../result.ts";

import { isBlobHeld } from "./blobHeld.ts";
import { deleteIfUnheld } from "./boardUpload.ts";
import { fitsPack, packAssets, refuseOversizePack } from "./configStore.ts";
import type { TvConfig, TvConfigSlide } from "./configXml.ts";
import { TV_LIMITS } from "./constants.ts";
import { HTML_CONTENT_TYPE } from "./packPaths.ts";
import { checkSlideFile, htmlTotal } from "./slideChecks.ts";

// The policy for a board-uploaded slide file: where it goes in the pack, and
// the limits it must keep. Shared by the add and the replace mutations.

export type SlideFile = {
	fileId: Id<"_storage">;
	size: number;
	contentType: string;
};

type Asset = Doc<"tvAssets">;

/** A slide file may not land on a path another slide's file already uses. */
function refuseCollision(
	config: TvConfig,
	path: string,
	ownerId: string | undefined
): void {
	if (
		config.slides.some(
			(slide) => slide.src === path && slide.id !== ownerId
		)
	)
		refuse({ type: "TvSlideInvalid" });
}

/** The pack holds `maxFiles` files, config.xml included; a replaced path adds none. */
function checkRoom(assets: Asset[], path: string): void {
	const isNew = !assets.some((asset) => asset.path === path);
	if (isNew && !fitsPack(assets.length + 1))
		refuse({ type: "TvTooManyFiles" });
}

/** The HTML slides' bytes together, the new file counted in place of `ownerId`'s old one. */
function checkHtmlTotal(
	assets: Asset[],
	config: TvConfig,
	file: { extension: string; size: number },
	ownerId: string | undefined
): void {
	if (file.extension !== "html") return;
	const sizes = new Map(assets.map((asset) => [asset.path, asset.size]));
	const others = config.slides
		.filter((slide) => slide.type === "html" && slide.id !== ownerId)
		.map((slide) => ({
			contentType: HTML_CONTENT_TYPE,
			size: sizes.get(slide.src) ?? 0,
		}));
	const total = htmlTotal([
		{ contentType: HTML_CONTENT_TYPE, size: file.size },
		...others,
	]);
	if (total > TV_LIMITS.htmlTotalMax) refuse({ type: "TvHtmlTooLarge" });
}

export async function assetAt(context: QueryCtx, path: string) {
	return context.db
		.query("tvAssets")
		.withIndex("by_path", (range) => range.eq("path", path))
		.first();
}

/**
 * Stores `fileId` as the pack file at `path`. A file replaced at the same
 * path loses its blob, unless another holder (an event picture, a legacy
 * slide, another pack row) keeps it.
 */
export async function putFile(
	context: MutationCtx,
	path: string,
	file: SlideFile
): Promise<void> {
	const existing = await assetAt(context, path);
	if (existing === null) {
		await context.db.insert("tvAssets", { path, ...file });
		return;
	}
	await context.db.patch(existing._id, file);
	await deleteIfUnheld(context, existing.fileId);
}

/**
 * Validates a file for slide `id` and says where it goes in the pack. `owner`
 * is the slide whose old file it replaces (none for a new slide).
 */
export async function checkReplacement(
	context: MutationCtx,
	config: TvConfig,
	slide: {
		id: string;
		type: TvConfigSlide["type"];
		fileId: Id<"_storage">;
		owner?: string;
	}
): Promise<{ path: string; file: SlideFile }> {
	const file = await checkSlideFile(context, slide.type, slide.fileId);
	if (await isBlobHeld(context, slide.fileId))
		refuse({ type: "TvImageInvalid" });
	const path = `slides/${slide.id}.${file.extension}`;
	refuseCollision(config, path, slide.owner);
	const assets = await packAssets(context.db);
	checkRoom(assets, path);
	checkHtmlTotal(assets, config, file, slide.owner);
	refuseOversizePack(assets, path, file.size);
	return {
		path,
		file: {
			fileId: slide.fileId,
			size: file.size,
			contentType: file.contentType,
		},
	};
}
