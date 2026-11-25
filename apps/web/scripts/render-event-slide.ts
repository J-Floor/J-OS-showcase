// Writes a sample event slide and its files to a folder, laid out like the
// pack's assets (the page sits at the folder root so its `assets/...` links
// resolve), to look at in a browser at 3840x2160:
//   bun scripts/render-event-slide.ts [--out <dir>] [--picture <image>] [--long] [--name <text>] [--two-day] [--no-qr] [--phase soon|live|past]
// Without --out it writes to a temp folder, not the repo.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { imageExtension, packContentType } from "../convex/lib/tv/packPaths.ts";
import { utcFromLocal } from "../convex/lib/time.ts";
import { eventSlideHtml, pastFrom } from "../convex/lib/tv/eventSlide.ts";
import {
	EVENT_FONT_KEYS,
	eventSlidePaths,
	fontBytes,
} from "../convex/lib/tv/eventSlideFiles.ts";

const SAMPLE_EVENT = "sampleevent00000000000000000000";
const SAMPLE_PICTURE = "samplepicture000000000000000000";
const STARTS_LOCAL = "2026-12-03T18:30:00+01:00[Europe/Zurich]";
const SAME_DAY_ENDS_LOCAL = "2026-12-03T21:00:00+01:00[Europe/Zurich]";
const TWO_DAY_ENDS_LOCAL = "2026-12-04T02:00:00+01:00[Europe/Zurich]";
const STARTS_AT = utcFromLocal(STARTS_LOCAL);
const { values } = parseArgs({
	options: {
		out: { type: "string" },
		picture: { type: "string" },
		long: { type: "boolean", default: false },
		name: { type: "string" },
		"two-day": { type: "boolean", default: false },
		"no-qr": { type: "boolean", default: false },
		phase: { type: "string", default: "soon" },
	},
});
const ENDS_LOCAL = values["two-day"] ? TWO_DAY_ENDS_LOCAL : SAME_DAY_ENDS_LOCAL;
const ENDS_AT = utcFromLocal(ENDS_LOCAL);
/** A moment inside each state, for `--phase`. */
const MOMENTS: Record<string, number> = {
	soon: STARTS_AT - 1,
	live: STARTS_AT + 1,
	past: pastFrom(ENDS_AT),
};
const phase = values.phase ?? "soon";
const now = Object.hasOwn(MOMENTS, phase) ? MOMENTS[phase] : undefined;
if (now === undefined) throw new Error("--phase is soon, live or past");
const out = resolve(values.out ?? join(tmpdir(), "event-slide"));
const extension = values.picture
	? imageExtension(packContentType(values.picture.toLowerCase()))
	: undefined;
if (values.picture && extension === undefined)
	throw new Error("--picture must be a png, jpg, webp or gif image");
const paths = eventSlidePaths(
	SAMPLE_EVENT,
	extension === undefined
		? undefined
		: { pictureId: SAMPLE_PICTURE, extension }
);

function put(path: string, bytes: string | Uint8Array): void {
	const target = join(out, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, bytes);
}

put(
	"index.html",
	eventSlideHtml(
		{
			name:
				values.name ??
				(values.long
					? "Founders breakfast with the climate tech investors of Zurich and Basel"
					: "Demo night"),
			description: values.long
				? "Ten teams show what they built this autumn, five minutes each, then questions from the room. ".repeat(
						6
					)
				: "Ten teams show what they built.\nDrinks after.",
			startsAt: STARTS_AT,
			endsAt: ENDS_AT,
			startsAtLocal: STARTS_LOCAL,
			endsAtLocal: ENDS_LOCAL,
			paths,
			signUpUrl: values["no-qr"]
				? undefined
				: `https://example.com/events/${SAMPLE_EVENT}`,
		},
		now
	)
);
for (const key of EVENT_FONT_KEYS) put(paths.fonts[key], fontBytes(key));
if (values.picture && paths.picture) {
	mkdirSync(dirname(join(out, paths.picture)), { recursive: true });
	copyFileSync(values.picture, join(out, paths.picture));
}
console.log(join(out, "index.html"));
