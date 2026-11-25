export const TV_LIMITS = {
	/** UTF-8 bytes (not characters): a document must stay under Convex's 1 MiB limit. */
	htmlMax: 400_000,
	/** UTF-8 bytes across every slide's HTML, so reading all slides stays bounded. */
	htmlTotalMax: 3_000_000,
	imageMaxBytes: 8_388_608,
	maxSlides: 50,
	maxDevices: 10,
	maxLivePairings: 20,
	pairingTtlMs: 600_000,
	durationMin: 5,
	durationMax: 300,
	durationDefault: 15,
	touchIntervalMs: 300_000,
} as const;

export const TV_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
] as const;

const TV_IMAGE_LABELS: Record<(typeof TV_IMAGE_TYPES)[number], string> = {
	"image/png": "PNG",
	"image/jpeg": "JPEG",
	"image/webp": "WebP",
	"image/gif": "GIF",
};

/** The `accept` value of a file input that takes a TV image. */
export const TV_IMAGE_ACCEPT = TV_IMAGE_TYPES.join(",");

/** "PNG, JPEG, WebP or GIF", for messages. */
export const TV_IMAGE_NAMES = `${TV_IMAGE_TYPES.slice(0, -1)
	.map((type) => TV_IMAGE_LABELS[type])
	.join(
		", "
	)} or ${TV_IMAGE_LABELS[TV_IMAGE_TYPES[TV_IMAGE_TYPES.length - 1]]}`;

export function isTvImageType(
	type: string | undefined
): type is (typeof TV_IMAGE_TYPES)[number] {
	return TV_IMAGE_TYPES.some((allowed) => allowed === type);
}

/** What the slideshow shows before a board member has chosen anything. */
export const TV_DEFAULT_TRANSITION = "fade" as const;
export const TV_INITIAL_VERSION = 0;

export const TV_PATHS = {
	pairStart: "/tv/pair/start",
	pairPoll: "/tv/pair/poll",
	manifest: "/tv/manifest",
	slide: "/tv/slide",
	pack: "/tv/pack",
	schedule: "/tv/schedule",
} as const;

/** Bearer auth, no cookies: any origin may call (the TV app runs from a file origin). */
export const TV_CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Max-Age": "86400",
} as const;

/** The config.xml pack (see `lib/tv/configXml.ts`, `lib/tv/packZip.ts`). */
export const TV_PACK_LIMITS = {
	/** The uploaded zip, and the sum of the files it unpacks to: 40 MiB. */
	packMaxBytes: 41_943_040,
	/** Files in a pack, config.xml included. */
	maxFiles: 200,
	/** UTF-8 bytes of config.xml. */
	configMaxBytes: 65_536,
	/** Wait this long after a config change before zipping, so a burst of edits builds once. */
	buildDelayMs: 5_000,
} as const;

/** Zip content types a browser sends for a `.zip` upload (the second is Windows'). */
export const TV_PACK_ZIP_TYPES: ReadonlySet<string> = new Set([
	"application/zip",
	"application/x-zip-compressed",
]);

const BYTES_PER_MIB = 1_048_576;

/** The pack maximum in MiB, for messages ("40"). */
export const TV_PACK_MAX_MB = TV_PACK_LIMITS.packMaxBytes / BYTES_PER_MIB;

/** Shown while the legacy `tvSlides` rows wait for `migrateTvSlidesToConfig`. */
export const TV_MIGRATING_MESSAGE =
	"The TV list is being moved to the new system and cannot be edited yet. Try again in a few minutes.";

/** An import whose uploaded blob is missing (or vanished mid-import). */
export const TV_UPLOAD_GONE = "The upload is gone. Try again.";
