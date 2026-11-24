import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { refuse, unwrap } from "../result.ts";
import { checkLength, NAME_MAX } from "../validate.ts";

import { checkImage } from "./checkImage.ts";
import { TV_LIMITS } from "./constants.ts";
import { HTML_CONTENT_TYPE, imageExtension } from "./packPaths.ts";

export function checkDuration(seconds: number): void {
	if (
		!Number.isInteger(seconds) ||
		seconds < TV_LIMITS.durationMin ||
		seconds > TV_LIMITS.durationMax
	)
		refuse({ type: "TvSlideInvalid" });
}

export function cleanTitle(title: string): string {
	unwrap(checkLength(title, NAME_MAX));
	const clean = title.trim();
	if (clean === "") refuse({ type: "TvSlideInvalid" });
	return clean;
}

/** Validates an uploaded slide file and says how it is stored. Validates only (a throw rolls back; the client discards). */
export async function checkSlideFile(
	context: MutationCtx,
	kind: "image" | "html",
	fileId: Id<"_storage">
): Promise<{ extension: string; size: number; contentType: string }> {
	if (kind === "image") await checkImage(context, fileId);
	const meta = await context.db.system.get("_storage", fileId);
	if (meta === null) refuse({ type: "TvSlideInvalid" });
	const contentType = meta.contentType ?? "";
	if (kind === "image")
		return {
			extension: imageExtension(contentType) ?? "png",
			size: meta.size,
			contentType,
		};
	if (!contentType.startsWith(HTML_CONTENT_TYPE))
		refuse({ type: "TvSlideInvalid" });
	if (meta.size > TV_LIMITS.htmlMax) refuse({ type: "TvHtmlTooLarge" });
	return {
		extension: "html",
		size: meta.size,
		contentType: HTML_CONTENT_TYPE,
	};
}

/** The UTF-8 bytes of the HTML files among `files`. */
export function htmlTotal(
	files: { contentType: string; size: number }[]
): number {
	return files
		.filter((file) => file.contentType === HTML_CONTENT_TYPE)
		.reduce((sum, file) => sum + file.size, 0);
}
