import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

/** True when an event holds the blob as its picture. */
export async function eventHoldsBlob(
	context: QueryCtx,
	fileId: Id<"_storage">
): Promise<boolean> {
	const event = await context.db
		.query("events")
		.withIndex("by_picture", (range) => range.eq("pictureId", fileId))
		.first();
	return event !== null;
}

/** True when a pack file (`tvAssets` row) holds the blob. */
export async function assetHoldsBlob(
	context: QueryCtx,
	fileId: Id<"_storage">
): Promise<boolean> {
	const asset = await context.db
		.query("tvAssets")
		.withIndex("by_fileId", (range) => range.eq("fileId", fileId))
		.first();
	return asset !== null;
}

/**
 * True when a slide, a pack file, the live pack zip or an event holds the blob. Deleting a held blob would
 * break that holder, so a discard leaves it be.
 */
export async function isBlobHeld(
	context: QueryCtx,
	fileId: Id<"_storage">
): Promise<boolean> {
	if (await assetHoldsBlob(context, fileId)) return true;
	const config = await context.db.query("tvConfig").first();
	if (config?.packFileId === fileId) return true;
	// An index lookup: the legacy table can hold megabytes of HTML, and this runs once per row in loops.
	const legacy = await context.db
		.query("tvSlides")
		.withIndex("by_fileId", (range) => range.eq("fileId", fileId))
		.first();
	return legacy !== null || (await eventHoldsBlob(context, fileId));
}
