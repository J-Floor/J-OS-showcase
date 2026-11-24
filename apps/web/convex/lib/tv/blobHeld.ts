import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

import { slidesInOrder } from "./queries.ts";

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

/**
 * True when a slide or an event holds the blob. Deleting a held blob would
 * break that holder, so a discard leaves it be.
 */
export async function isBlobHeld(
	context: QueryCtx,
	fileId: Id<"_storage">
): Promise<boolean> {
	const slides = await slidesInOrder(context.db);
	return slides.some((slide) => slide.fileId === fileId)
		? true
		: eventHoldsBlob(context, fileId);
}
