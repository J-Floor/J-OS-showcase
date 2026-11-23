import { tvMessages } from "../../../../convex/lib/errors/tv.ts";
import {
	isTvImageType,
	TV_IMAGE_NAMES,
	TV_LIMITS,
} from "../../../../convex/lib/tv/constants.ts";
import { htmlBytes } from "../../../../convex/lib/tv/htmlBytes.ts";

/** What a chosen or dropped file turns into, or why it cannot be a slide. */
export type SlideFile =
	| { kind: "html"; htmlText: string }
	| { kind: "image"; file: File }
	| { kind: "error"; message: string };

const UNSUPPORTED = `Choose a ${TV_IMAGE_NAMES} image, or an HTML file.`;
const HTML_NAME = /\.html?$/i;

function isHtml(file: File): boolean {
	return file.type === "text/html" || HTML_NAME.test(file.name);
}

/**
 * Sorts a file into an HTML slide (its text is read), an image slide (kept as
 * the file, to upload) or an error. Checked here, before anything uploads,
 * against the same limits the server enforces; SVG is refused (it can carry
 * script).
 */
export async function readSlideFile(file: File): Promise<SlideFile> {
	if (isHtml(file)) {
		const htmlText = await file.text();
		return htmlBytes(htmlText) > TV_LIMITS.htmlMax
			? { kind: "error", message: tvMessages.TvHtmlTooLarge }
			: { kind: "html", htmlText };
	}
	if (!isTvImageType(file.type) || file.size > TV_LIMITS.imageMaxBytes)
		return {
			kind: "error",
			message: isTvImageType(file.type)
				? tvMessages.TvImageInvalid
				: UNSUPPORTED,
		};
	return { kind: "image", file };
}
