import {
	isTvImageType,
	TV_IMAGE_TYPES,
	TV_LIMITS,
	TV_PACK_LIMITS,
} from "./constants.ts";

/** The one file at the top of a pack. */
export const PACK_CONFIG_PATH = "config.xml";

/** `slides/<id>.<ext>`: one flat folder, lowercase names, slide types only. */
const SLIDE_PATH =
	/^slides\/[a-z0-9][a-z0-9-]{0,63}\.(?:html|png|jpg|jpeg|webp|gif)$/;

/**
 * `assets/` up to four folders deep. A segment cannot start with a dot, so
 * `..` and hidden files never match. No SVG, scripts, CSS or HTML: an HTML
 * slide keeps its styles inline and its markup in `slides/`.
 */
const ASSET_PATH =
	/^assets\/(?:\w[\w.-]{0,63}\/){0,3}\w[\w.-]{0,63}\.(?:png|jpg|jpeg|webp|gif|woff|woff2|ttf|otf)$/;

/** What an HTML slide file is stored and served as. */
export const HTML_CONTENT_TYPE = "text/html";

const CONTENT_TYPES: Record<string, string> = {
	html: HTML_CONTENT_TYPE,
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
};

/** Slide ids: lowercase letters, digits and dashes, at most 64 (the `<id>` of `slides/<id>.<ext>`). */
export const SLIDE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Extensions of the image files a slide may point at. */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
]);

/** The extension an uploaded image of this content type is stored under; undefined for a type no TV image may have. */
export function imageExtension(
	contentType: string | undefined
): string | undefined {
	return isTvImageType(contentType) ? IMAGE_BY_TYPE[contentType] : undefined;
}

const IMAGE_BY_TYPE: Record<(typeof TV_IMAGE_TYPES)[number], string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
};

export function isSlidePath(path: string): boolean {
	return SLIDE_PATH.test(path);
}

export function isAssetPath(path: string): boolean {
	return ASSET_PATH.test(path);
}

/** A path a pack file may have (config.xml aside). */
export function isPackPath(path: string): boolean {
	return isSlidePath(path) || isAssetPath(path);
}

export function extensionOf(path: string): string {
	return path.slice(path.lastIndexOf(".") + 1);
}

/** The content type a pack file is stored and served with, from its extension. */
export function packContentType(path: string): string {
	return CONTENT_TYPES[extensionOf(path)] ?? "application/octet-stream";
}

/** The largest a single pack file may be. */
export function packFileMaxBytes(path: string): number {
	if (path === PACK_CONFIG_PATH) return TV_PACK_LIMITS.configMaxBytes;
	return extensionOf(path) === "html"
		? TV_LIMITS.htmlMax
		: TV_LIMITS.imageMaxBytes;
}
