import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { refuse } from "../result.ts";

import { isTvImageType, TV_LIMITS } from "./constants.ts";

/**
 * Validates only. A throw rolls the whole mutation back, so deleting a
 * rejected blob here would be undone; the client calls a discard mutation.
 */
export async function checkImage(
	context: MutationCtx,
	fileId: Id<"_storage">
): Promise<void> {
	const meta = await context.db.system.get("_storage", fileId);
	const isValid =
		meta !== null &&
		isTvImageType(meta.contentType) &&
		meta.size <= TV_LIMITS.imageMaxBytes;
	if (!isValid) refuse({ type: "TvImageInvalid" });
}
