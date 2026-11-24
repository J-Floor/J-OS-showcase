import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { requireRole } from "../authGuard.ts";
import { unwrap } from "../result.ts";
import { BOARD_LEVEL } from "../roles.ts";

import { isBlobHeld } from "./blobHeld.ts";

/** Deletes a blob unless it has already vanished (a delete of a missing one throws). */
export async function deleteBlob(
	context: MutationCtx,
	fileId: Id<"_storage">
): Promise<void> {
	if (await context.db.system.get("_storage", fileId))
		await context.storage.delete(fileId);
}

/** Board-only: a one-shot URL to upload a picture to. */
export async function boardUploadUrl(context: MutationCtx): Promise<string> {
	unwrap(await requireRole(context, BOARD_LEVEL));
	return context.storage.generateUploadUrl();
}

/** Board-only: drops an upload unless a slide or an event holds it. */
export async function discardUnheldUpload(
	context: MutationCtx,
	fileId: Id<"_storage">
): Promise<void> {
	unwrap(await requireRole(context, BOARD_LEVEL));
	if (await isBlobHeld(context, fileId)) return;
	await deleteBlob(context, fileId);
}
