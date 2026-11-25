import { invariant } from "../result.ts";
import { NAME_MAX } from "../validate.ts";

import type { EventSlide } from "./configEdits.ts";
import { EVENT_FONTS } from "./eventFonts.ts";

// Where an event's slide lives in the pack. Every file an event writes is
// its own (`tvAssets.sourceEventId`), fonts included: a pack import replaces
// every other file, and one owner per file needs no refcount.

/** How long an event slide shows. */
export const TV_EVENT_SLIDE_SECONDS = 20;
/** The slide's title when the event's name has no text. */
const TV_EVENT_SLIDE_FALLBACK_TITLE = "Event";

export type EventFontKey = keyof typeof EVENT_FONTS;
export const EVENT_FONT_KEYS = Object.keys(EVENT_FONTS) as EventFontKey[];

export type EventSlidePaths = {
	html: string;
	fonts: Record<EventFontKey, string>;
	picture?: string;
};

/** Convex ids and blob ids: lowercase letters and digits. The paths go into `url("...")` in the page's `<style>`, so nothing else may get in. */
const ID_PATTERN = /^[a-z0-9]+$/;
/** A blob id may carry an underscore (test ids do): safe in `url("...")` and valid in `assets/` paths. */
const BLOB_ID_PATTERN = /^[a-z0-9_]+$/;
const EXTENSION_PATTERN = /^[a-z0-9]+$/;

/** The pack paths of an event's slide; the picture's name carries its source blob id, so a new picture is a new file. */
export function eventSlidePaths(
	eventId: string,
	picture?: { pictureId: string; extension: string }
): EventSlidePaths {
	invariant(
		ID_PATTERN.test(eventId),
		"eventSlidePaths: the event id is not [a-z0-9]+"
	);
	invariant(
		picture === undefined ||
			(BLOB_ID_PATTERN.test(picture.pictureId) &&
				EXTENSION_PATTERN.test(picture.extension)),
		"eventSlidePaths: the picture id is not [a-z0-9_]+ or the extension is not [a-z0-9]+"
	);
	const folder = `assets/events/${eventId}`;
	return {
		html: `slides/${eventSlideId(eventId)}.html`,
		fonts: Object.fromEntries(
			EVENT_FONT_KEYS.map((key) => [
				key,
				`${folder}/${EVENT_FONTS[key].file}`,
			])
		) as Record<EventFontKey, string>,
		...(picture === undefined
			? {}
			: {
					picture: `${folder}/picture-${picture.pictureId}.${picture.extension}`,
				}),
	};
}

function eventSlideId(eventId: string): string {
	return `event-${eventId}`;
}

/** The event's name as a slide title: one line (an XML attribute folds line breaks), capped like any title. */
function eventSlideTitle(name: string): string {
	const title = name.replaceAll(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
	return title === "" ? TV_EVENT_SLIDE_FALLBACK_TITLE : title;
}

/** The `<slide>` an event owns: always shown while the event is on the TV, titled with the event's name (a rename changes the entry, so the sync rewrites it). */
export function eventSlideEntry(eventId: string, name: string): EventSlide {
	return {
		id: eventSlideId(eventId),
		type: "html",
		src: eventSlidePaths(eventId).html,
		duration: TV_EVENT_SLIDE_SECONDS,
		enabled: true,
		title: eventSlideTitle(name),
		source: "event",
		event: eventId,
	};
}

export function fontBytes(key: EventFontKey): Uint8Array {
	const { hex } = EVENT_FONTS[key];
	const bytes = new Uint8Array(hex.length / HEX_CHARS_PER_BYTE);
	for (let index = 0; index < bytes.length; index += 1) {
		const at = index * HEX_CHARS_PER_BYTE;
		bytes[index] = Number.parseInt(
			hex.slice(at, at + HEX_CHARS_PER_BYTE),
			16
		);
	}
	return bytes;
}

const HEX_CHARS_PER_BYTE = 2;

/** Size from the string length alone, so the plan query never decodes. */
export function fontSize(key: EventFontKey): number {
	return EVENT_FONTS[key].hex.length / HEX_CHARS_PER_BYTE;
}
