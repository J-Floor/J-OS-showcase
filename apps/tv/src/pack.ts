import {
	rewriteAssetRefs,
	type PlayerSlide,
	type Transition,
} from "@j-os/tv-player";
import { strFromU8, unzipSync } from "fflate";

/** An image slide's blob: URL and what it was made from (byte length and hash), by pack path. */
export type ImageCache = ReadonlyMap<string, { key: string; url: string }>;

/**
 * A pack ready to play. `objectUrls` are the image slides' blob: URLs, for the
 * caller to revoke, except any it was handed through `reuse`: those still
 * belong to the pack that made them. `images` is what the next load may reuse.
 */
export type LoadedPack = {
	transition: Transition;
	slides: PlayerSlide[];
	objectUrls: string[];
	images: ImageCache;
};

const TYPES: Record<string, string> = {
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
const TRANSITIONS: readonly Transition[] = ["fade", "slide", "none"];
/** Mirrors `TV_LIMITS` in apps/web/convex/lib/tv/constants.ts: the server only builds packs within these. */
const DURATION_MIN = 5;
const DURATION_MAX = 300;
const DEFAULT_SECONDS = 15;
/** Mirrors SLIDE_PATH in apps/web/convex/lib/tv/packPaths.ts: one flat folder of lowercase names. */
const SLIDE_PATH =
	/^slides\/[a-z0-9][a-z0-9-]{0,63}\.(?:html|png|jpg|jpeg|webp|gif)$/;
const CONFIG_PATH = "config.xml";
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const CONFIG_MAX_KIB = 64;
const ENTRY_MAX_MIB = 8;
const TOTAL_MAX_MIB = 64;
/** The server already bounds a pack (images and assets at 8 MiB, config at 64 KiB); these are a second wall on a small device. */
const CONFIG_MAX_BYTES = CONFIG_MAX_KIB * BYTES_PER_KIB;
const ENTRY_MAX_BYTES = ENTRY_MAX_MIB * BYTES_PER_MIB;
/** Everything inflated for one pack load (an asset counts once: its data: URI is reused across slides). */
const TOTAL_MAX_BYTES = TOTAL_MAX_MIB * BYTES_PER_MIB;
/**
 * The most characters all HTML slides of one pack may hold together. Every
 * HTML slide carries its own copy of each data: URI it uses, so the inflate
 * cap above (which counts an asset once) does not bound the strings: 13 slides
 * sharing one 5 MiB asset are 13 x 7 MB of base64. 96 MiB keeps the resident
 * strings of one pack within what the largest legitimate pack needs (the
 * server's 40 MiB zip) and below twice that of the old and new pack during a
 * swap; chosen from reading, not measured on a TV (see README).
 */
const HTML_TOTAL_MAX_MIB = 96;
const HTML_TOTAL_MAX_CHARS = HTML_TOTAL_MAX_MIB * BYTES_PER_MIB;
/** Bytes per String.fromCharCode call: under the engine's argument limit, and a multiple of 3 so each chunk's base64 has no padding and the pieces concatenate. */
const CHUNK = 0x7ffe;

function typeOf(path: string): string {
	// Own keys only (a file named `a.constructor` is not a function), any case.
	// eslint-disable-next-line no-restricted-syntax -- a file extension is looked up, not shown
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return Object.prototype.hasOwnProperty.call(TYPES, extension)
		? (TYPES[extension] ?? "application/octet-stream")
		: "application/octet-stream";
}

const FNV_OFFSET = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

/** Length plus a 32-bit FNV-1a hash of the bytes: enough to tell a re-uploaded image from the one already shown. */
function imageKey(bytes: Uint8Array): string {
	let hash = FNV_OFFSET;
	for (const byte of bytes) {
		hash = Math.imul(hash ^ byte, FNV_PRIME);
	}
	return `${String(bytes.length)}:${String(hash >>> 0)}`;
}

function base64(bytes: Uint8Array): string {
	// Encode a chunk at a time: the whole file never exists as one binary string next to its base64.
	const pieces: string[] = [];
	for (let start = 0; start < bytes.length; start += CHUNK)
		pieces.push(
			btoa(String.fromCharCode(...bytes.subarray(start, start + CHUNK)))
		);
	return pieces.join("");
}

function readRoot(text: string): Element {
	const document = new DOMParser().parseFromString(text, "application/xml");
	const root = document.documentElement;
	if (
		document.getElementsByTagName("parsererror").length > 0 ||
		root.nodeName !== "tv"
	)
		throw new Error("config.xml is not a TV config");
	return root;
}

function toTransition(value: string | null): Transition {
	return TRANSITIONS.find((transition) => transition === value) ?? "fade";
}

type Reader = {
	/** One entry's bytes, inflated on demand (the rest of the zip stays compressed), or undefined when absent. */
	read: (path: string) => Uint8Array | undefined;
};

function openZip(zip: Uint8Array): Reader {
	let total = 0;
	return {
		read: (path) => {
			const limit =
				path === CONFIG_PATH ? CONFIG_MAX_BYTES : ENTRY_MAX_BYTES;
			const files = unzipSync(zip, {
				filter: (file) => {
					if (file.name !== path) return false;
					total += file.originalSize;
					if (file.originalSize > limit || total > TOTAL_MAX_BYTES)
						throw new Error(`${path} is too large`);
					return true;
				},
			});
			return files[path];
		},
	};
}

type Build = {
	reader: Reader;
	objectUrls: string[];
	/** The blob: URLs this load made itself (the ones to revoke if it fails). */
	created: string[];
	reuse: ImageCache;
	images: Map<string, { key: string; url: string }>;
	htmlChars: { total: number };
	resolve: (path: string) => string | undefined;
};

type Declared = {
	id: string;
	source: string;
	type: "html" | "image";
	durationSec: number;
};

function isSeconds(value: number): boolean {
	return (
		Number.isInteger(value) &&
		value >= DURATION_MIN &&
		value <= DURATION_MAX
	);
}

/** The slide's attributes when it is enabled and valid like the server's (type, path, whole seconds in range); else undefined. */
function declared(element: Element): Declared | undefined {
	const id = element.getAttribute("id");
	const source = element.getAttribute("src");
	const type = element.getAttribute("type");
	if (element.getAttribute("enabled") === "false" || id === null)
		return undefined;
	if ((type !== "html" && type !== "image") || source === null)
		return undefined;
	if (!SLIDE_PATH.test(source)) return undefined;
	const durationSec = Number(
		element.getAttribute("duration") ?? DEFAULT_SECONDS
	);
	return isSeconds(durationSec)
		? { id, source, type, durationSec }
		: undefined;
}

function toSlide(element: Element, build: Build): PlayerSlide | undefined {
	const slide = declared(element);
	return slide === undefined ? undefined : buildSlide(slide, build);
}

function buildSlide(
	{ id, source, type, durationSec }: Declared,
	build: Build
): PlayerSlide | undefined {
	const bytes = build.reader.read(source);
	if (bytes === undefined) return undefined;
	if (type === "html") {
		const html = rewriteAssetRefs(strFromU8(bytes), build.resolve);
		build.htmlChars.total += html.length;
		if (build.htmlChars.total > HTML_TOTAL_MAX_CHARS)
			throw new Error("the HTML slides are too large together");
		return { id, kind: "html", durationSec, html };
	}
	const key = imageKey(bytes);
	const known = build.reuse.get(source);
	// Same path and same bytes as the pack on screen: keep its blob URL, so
	// the player sees the same slide and does not redraw it.
	const imageUrl =
		known?.key === key
			? known.url
			: URL.createObjectURL(
					new Blob([bytes as Uint8Array<ArrayBuffer>], {
						type: typeOf(source),
					})
				);
	if (imageUrl !== known?.url) build.created.push(imageUrl);
	build.objectUrls.push(imageUrl);
	build.images.set(source, { key, url: imageUrl });
	return { id, kind: "image", durationSec, imageUrl };
}

/**
 * Turns a downloaded pack into player slides. The server ships only packs it
 * validated, in canonical form; this still skips anything it cannot play and
 * caps what it inflates. Entries are inflated one at a time and dropped once
 * used (memory on the TV is small). HTML slides get their `assets/...` as
 * data: URIs (a sandboxed srcdoc frame can load those); image slides get
 * blob: URLs (drawn by a top-level <img>).
 * Image slides whose path and bytes match `reuse` (the pack now on screen)
 * keep that pack's blob URL. Throws on a broken pack, after revoking any URL
 * it made (never a reused one): the caller keeps the last good one.
 */
export function loadPack(
	zip: Uint8Array,
	reuse: ImageCache = new Map()
): LoadedPack {
	const reader = openZip(zip);
	const config = reader.read(CONFIG_PATH);
	if (config === undefined) throw new Error("the pack has no config.xml");
	const root = readRoot(strFromU8(config));
	const dataUris = new Map<string, string>();
	const objectUrls: string[] = [];
	const build: Build = {
		reader,
		objectUrls,
		created: [],
		reuse,
		images: new Map(),
		htmlChars: { total: 0 },
		resolve: (path) => {
			const cached = dataUris.get(path);
			if (cached !== undefined) return cached;
			const bytes = reader.read(path);
			const uri =
				bytes === undefined
					? undefined
					: `data:${typeOf(path)};base64,${base64(bytes)}`;
			if (uri !== undefined) dataUris.set(path, uri);
			return uri;
		},
	};
	try {
		const slides: PlayerSlide[] = [];
		const elements = Array.from(root.getElementsByTagName("slide"));
		for (const element of elements) {
			const slide = toSlide(element, build);
			if (slide !== undefined) slides.push(slide);
		}
		return {
			transition: toTransition(root.getAttribute("transition")),
			slides,
			objectUrls,
			images: build.images,
		};
	} catch (error) {
		for (const url of build.created) URL.revokeObjectURL(url);
		throw error;
	}
}
