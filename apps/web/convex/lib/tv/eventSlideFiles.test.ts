import { describe, expect, it } from "vitest";

import { parseConfigXml, serializeConfig } from "./configXml.ts";
import {
	eventSlideEntry,
	eventSlidePaths,
	fontBytes,
	fontSize,
	TV_EVENT_SLIDE_SECONDS,
} from "./eventSlideFiles.ts";
import { isAssetPath, isSlidePath } from "./packPaths.ts";

/** Shaped like Convex ids (lowercase, 32 long), letters only so the mirror gate does not read them as real ids. */
const EVENT = "jdaxkmnpqrstvwxyzabcdefghjkmnpqr";
const PICTURE = "kgbcdfghjklmnpqrstvwxyzabcdfghjk";

describe("eventSlidePaths", () => {
	it("puts every file where a pack may hold it", () => {
		const paths = eventSlidePaths(EVENT, {
			pictureId: PICTURE,
			extension: "jpg",
		});
		expect(paths.html).toBe(`slides/event-${EVENT}.html`);
		expect(isSlidePath(paths.html)).toBe(true);
		expect(paths.fonts.body).toBe(`assets/events/${EVENT}/manrope.woff2`);
		expect(paths.fonts.display).toBe(
			`assets/events/${EVENT}/azeret-mono.woff2`
		);
		expect(paths.picture).toBe(
			`assets/events/${EVENT}/picture-${PICTURE}.jpg`
		);
		for (const path of [
			paths.fonts.body,
			paths.fonts.display,
			paths.picture ?? "",
		])
			expect(isAssetPath(path)).toBe(true);
	});

	it.each(["", "a/b", "..", 'x")}body{', "ABC", "a b", "ab\n", "é"])(
		"refuses the id %j, which could break out of the page's url()",
		(id) => {
			expect(() => eventSlidePaths(id)).toThrow(/event id/);
		}
	);

	it.each([
		{ pictureId: 'x")', extension: "jpg" },
		{ pictureId: PICTURE, extension: 'j"pg' },
		{ pictureId: PICTURE, extension: "" },
	])("refuses the picture %j", (picture) => {
		expect(() => eventSlidePaths(EVENT, picture)).toThrow(/picture/);
	});

	it("has no picture path without a picture", () => {
		expect(eventSlidePaths(EVENT).picture).toBeUndefined();
	});
});

describe("eventSlideEntry", () => {
	it("is an event slide the config parser reads back unchanged", () => {
		const entry = eventSlideEntry(EVENT, "Pitch night");
		expect(entry).toEqual({
			id: `event-${EVENT}`,
			type: "html",
			src: `slides/event-${EVENT}.html`,
			duration: TV_EVENT_SLIDE_SECONDS,
			enabled: true,
			title: "Pitch night",
			source: "event",
			event: EVENT,
		});
		const parsed = parseConfigXml(
			serializeConfig({ transition: "fade", slides: [entry] })
		);
		expect(parsed.isOk() && parsed.value.slides).toEqual([entry]);
	});
});

describe("eventSlideEntry title", () => {
	it("folds line breaks, caps at the title limit and never goes blank", () => {
		expect(eventSlideEntry(EVENT, "  Two\nlines  ").title).toBe(
			"Two lines"
		);
		expect(eventSlideEntry(EVENT, "x".repeat(300)).title).toBe(
			"x".repeat(200)
		);
		expect(eventSlideEntry(EVENT, " \n ").title).toBe("Event");
	});

	it("differs between two events, so the TV list tells them apart", () => {
		expect(eventSlideEntry(EVENT, "A").title).not.toBe(
			eventSlideEntry(EVENT, "B").title
		);
	});
});

describe("fontBytes", () => {
	it("decodes each embedded font to woff2 bytes", () => {
		for (const key of ["body", "display"] as const) {
			const bytes = fontBytes(key);
			expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("wOF2");
			expect(fontSize(key)).toBe(bytes.length);
		}
	});
});
