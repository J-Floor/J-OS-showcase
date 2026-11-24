import { tvMessages } from "../../convex/lib/errors/tv.ts";
import {
	isTvImageType,
	TV_IMAGE_NAMES,
	TV_LIMITS,
} from "../../convex/lib/tv/constants.ts";

/** Why a chosen file cannot be a TV image (wrong type, too big), or null
 *  when it can. Checked before anything uploads, against the same limits
 *  the server enforces. */
export function tvImageProblem(
	file: Pick<File, "type" | "size">
): string | null {
	if (!isTvImageType(file.type)) return `Choose a ${TV_IMAGE_NAMES} image.`;
	if (file.size > TV_LIMITS.imageMaxBytes) return tvMessages.TvImageInvalid;
	return null;
}
