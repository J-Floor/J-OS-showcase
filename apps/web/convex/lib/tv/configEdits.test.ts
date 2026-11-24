import { describe, expect, it } from "vitest";

import {
	appendSlide,
	eventSlideProblems,
	missingSources,
	moveSlide,
	nextSlideId,
	removeEventSlides,
	removeSlide,
	setSlideFields,
	upsertEventSlide,
	withEventSlides,
} from "./configEdits.ts";
import type { TvConfig, TvConfigSlide } from "./configXml.ts";
import { TV_LIMITS } from "./constants.ts";

function manual(id: string): TvConfigSlide {
	return {
		id,
		type: "image",
		src: `slides/${id}.png`,
		duration: 15,
		enabled: true,
	};
}

const EVENT: TvConfigSlide & { source: "event"; event: string } = {
	id: "event-abc",
	type: "html",
	src: "slides/event-abc.html",
	duration: 20,
	enabled: true,
	source: "event",
	event: "abc",
};

const CONFIG: TvConfig = {
	transition: "fade",
	slides: [manual("a"), EVENT, manual("b")],
};

function ids(config: TvConfig): string[] {
	return config.slides.map((slide) => slide.id);
}

describe("manual edits", () => {
	it("sets fields on a manual slide and ignores undefined ones", () => {
		const edited = setSlideFields(CONFIG, "a", {
			duration: 30,
			title: undefined,
		});
		expect(edited.isOk() && edited.value.slides[0]).toEqual({
			...manual("a"),
			duration: 30,
		});
	});

	it("never touches an event slide", () => {
		for (const edit of [
			setSlideFields(CONFIG, "event-abc", { enabled: false }),
			moveSlide(CONFIG, "event-abc", "up"),
			removeSlide(CONFIG, "event-abc"),
		])
			expect(edit.isErr() && edit.error).toEqual({
				type: "TvEventSlideLocked",
			});
	});

	it("refuses an unknown id", () => {
		const edit = removeSlide(CONFIG, "nope");
		expect(edit.isErr() && edit.error).toEqual({ type: "TvSlideNotFound" });
	});

	it("moves past neighbours and is a no-op at the ends", () => {
		const down = moveSlide(CONFIG, "a", "down");
		expect(down.isOk() && ids(down.value)).toEqual(["event-abc", "a", "b"]);
		const top = moveSlide(CONFIG, "a", "up");
		expect(top.isOk() && ids(top.value)).toEqual(["a", "event-abc", "b"]);
	});

	it("moves a middle slide up past an event slide and the last slide down is a no-op", () => {
		const up = moveSlide(CONFIG, "b", "up");
		expect(up.isOk() && ids(up.value)).toEqual(["a", "b", "event-abc"]);
		const last = moveSlide(CONFIG, "b", "down");
		expect(last.isOk() && last.value).toBe(CONFIG);
	});

	it("leaves a frozen config untouched", () => {
		const frozen: TvConfig = Object.freeze({
			...CONFIG,
			slides: Object.freeze([...CONFIG.slides]) as TvConfigSlide[],
		});
		const moved = moveSlide(frozen, "a", "down");
		expect(moved.isOk() && ids(moved.value)).toEqual([
			"event-abc",
			"a",
			"b",
		]);
		expect(ids(frozen)).toEqual(["a", "event-abc", "b"]);
	});

	it("removes a manual slide", () => {
		const removed = removeSlide(CONFIG, "b");
		expect(removed.isOk() && ids(removed.value)).toEqual([
			"a",
			"event-abc",
		]);
	});

	it("appends, refusing duplicates, event slides and a full show", () => {
		const added = appendSlide(CONFIG, manual("c"));
		expect(added.isOk() && ids(added.value)).toEqual([
			"a",
			"event-abc",
			"b",
			"c",
		]);
		const twice = appendSlide(CONFIG, manual("a"));
		expect(twice.isErr() && twice.error).toEqual({
			type: "TvSlideInvalid",
		});
		const event = appendSlide(CONFIG, { ...EVENT, id: "event-x" });
		expect(event.isErr() && event.error).toEqual({
			type: "TvEventSlideLocked",
		});
		const full: TvConfig = {
			transition: "fade",
			slides: Array.from({ length: TV_LIMITS.maxSlides }, (_, index) =>
				manual(`s${String(index)}`)
			),
		};
		const over = appendSlide(full, manual("c"));
		expect(over.isErr() && over.error).toEqual({ type: "TvTooManySlides" });
	});

	it("numbers new slides after the highest slide-N", () => {
		expect(nextSlideId(CONFIG)).toBe("slide-1");
		expect(
			nextSlideId({
				transition: "fade",
				slides: [manual("slide-2"), manual("slide-9")],
			})
		).toBe("slide-10");
	});
});

describe("event slides (PR C's writer)", () => {
	it("replaces an event's slide in place, or appends it", () => {
		const replaced = upsertEventSlide(CONFIG, { ...EVENT, duration: 25 });
		expect(replaced.isOk() && replaced.value.slides[1]?.duration).toBe(25);
		const added = upsertEventSlide(CONFIG, {
			...EVENT,
			id: "event-def",
			event: "def",
			src: "slides/event-def.html",
		});
		expect(added.isOk() && ids(added.value)).toEqual([
			"a",
			"event-abc",
			"b",
			"event-def",
		]);
	});

	it("refuses a new event slide whose id a manual slide holds", () => {
		const clash = upsertEventSlide(CONFIG, {
			...EVENT,
			id: "a",
			event: "def",
		});
		expect(clash.isErr() && clash.error).toEqual({
			type: "TvSlideInvalid",
		});
	});

	it("refuses to replace an event slide with an id a manual slide holds", () => {
		const clash = upsertEventSlide(CONFIG, { ...EVENT, id: "a" });
		expect(clash.isErr() && clash.error).toEqual({
			type: "TvSlideInvalid",
		});
	});

	it("removes only that event's slides", () => {
		expect(ids(removeEventSlides(CONFIG, "abc"))).toEqual(["a", "b"]);
		expect(ids(removeEventSlides(CONFIG, "zzz"))).toEqual([
			"a",
			"event-abc",
			"b",
		]);
	});

	it("leaves manual slides alone even when one carries the event's id or field", () => {
		const stale = { ...manual("stale"), event: "abc" };
		const config: TvConfig = {
			transition: "fade",
			slides: [manual("abc"), stale, EVENT],
		};
		expect(ids(removeEventSlides(config, "abc"))).toEqual(["abc", "stale"]);
		const upserted = upsertEventSlide(config, { ...EVENT, duration: 40 });
		expect(upserted.isOk() && upserted.value.slides.slice(0, 2)).toEqual([
			manual("abc"),
			stale,
		]);
		expect(upserted.isOk() && upserted.value.slides[2]?.duration).toBe(40);
	});
});

describe("checks for a board save", () => {
	it("accepts a save that keeps event slides as they were (moved is fine)", () => {
		const next: TvConfig = {
			transition: "slide",
			slides: [EVENT, manual("a")],
		};
		expect(eventSlideProblems(CONFIG, next)).toEqual([]);
	});

	it("refuses a save that changes, drops or invents an event slide", () => {
		const changed: TvConfig = {
			...CONFIG,
			slides: [manual("a"), { ...EVENT, enabled: false }],
		};
		expect(eventSlideProblems(CONFIG, changed)).toHaveLength(2);
		const dropped: TvConfig = { ...CONFIG, slides: [manual("a")] };
		expect(eventSlideProblems(CONFIG, dropped)[0]?.message).toContain(
			"event-abc"
		);
		const invented: TvConfig = {
			...CONFIG,
			slides: [
				...CONFIG.slides,
				{ ...EVENT, id: "event-new", event: "new" },
			],
		};
		expect(eventSlideProblems(CONFIG, invented)[0]?.message).toContain(
			"event-new"
		);
	});

	it("refuses a save that duplicates an event slide", () => {
		const duplicated: TvConfig = {
			...CONFIG,
			slides: [...CONFIG.slides, EVENT],
		};
		expect(eventSlideProblems(CONFIG, duplicated)).toHaveLength(1);
		expect(eventSlideProblems(duplicated, CONFIG)).toHaveLength(1);
	});

	it("lists slides whose file is not in the pack", () => {
		const paths = new Set(["slides/a.png", "slides/event-abc.html"]);
		expect(missingSources(CONFIG, paths)).toEqual([
			{
				message:
					'Slide "b": slides/b.png is not in the pack. Upload it first.',
			},
		]);
	});
});

describe("withEventSlides (pack import)", () => {
	it("keeps the current event slides after the imported ones", () => {
		const imported: TvConfig = {
			transition: "none",
			slides: [manual("x")],
		};
		const merged = withEventSlides(imported, CONFIG);
		expect(merged.isOk() && merged.value).toEqual({
			transition: "none",
			slides: [manual("x"), EVENT],
		});
	});

	it("refuses an import that carries event slides or reuses their ids", () => {
		const carrying = withEventSlides(
			{ transition: "fade", slides: [EVENT] },
			CONFIG
		);
		expect(carrying.isErr()).toBe(true);
		const clashing = withEventSlides(
			{ transition: "fade", slides: [{ ...manual("event-abc") }] },
			CONFIG
		);
		expect(clashing.isErr() && clashing.error[0]).toContain("event-abc");
	});
});
