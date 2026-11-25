import { describe, expect, it } from "vitest";

import {
	appendSlide,
	eventSlideProblems,
	missingSources,
	moveSlide,
	nextSlideId,
	removeEventSlides,
	removeSlide,
	reorderSlides,
	sameEventSlide,
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

	it("never removes or rewrites an event slide's content", () => {
		for (const edit of [
			setSlideFields(CONFIG, "event-abc", { enabled: false }),
			setSlideFields(CONFIG, "event-abc", { title: "x" }),
			setSlideFields(CONFIG, "event-abc", { src: "x" }),
			setSlideFields(CONFIG, "event-abc", { duration: 30, title: "x" }),
			removeSlide(CONFIG, "event-abc"),
		])
			expect(edit.isErr() && edit.error).toEqual({
				type: "TvEventSlideLocked",
			});
	});

	it("lets the board set an event slide's duration and move it", () => {
		const timed = setSlideFields(CONFIG, "event-abc", { duration: 30 });
		expect(timed.isOk() && timed.value.slides[1]).toEqual({
			...EVENT,
			duration: 30,
		});
		const up = moveSlide(CONFIG, "event-abc", "up");
		expect(up.isOk() && ids(up.value)).toEqual(["event-abc", "a", "b"]);
		const down = moveSlide(CONFIG, "event-abc", "down");
		expect(down.isOk() && ids(down.value)).toEqual(["a", "b", "event-abc"]);
	});

	it("reorders by id and refuses a wrong id set", () => {
		const config: TvConfig = {
			transition: "fade",
			slides: [manual("a"), manual("b"), manual("c")],
		};
		const reordered = reorderSlides(config, ["c", "a", "b"]);
		expect(reordered.isOk() && ids(reordered.value)).toEqual([
			"c",
			"a",
			"b",
		]);
		for (const wrong of [
			["a", "b"],
			["a", "b", "c", "d"],
			["a", "a", "b"],
			["a", "b", "x"],
		]) {
			const edit = reorderSlides(config, wrong);
			expect(edit.isErr() && edit.error).toEqual({
				type: "TvConfigStale",
			});
		}
	});

	it("returns the same config when the order does not change", () => {
		const same = reorderSlides(CONFIG, ["a", "event-abc", "b"]);
		expect(same.isOk() && same.value).toBe(CONFIG);
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
		const replaced = upsertEventSlide(CONFIG, { ...EVENT, title: "New" });
		expect(replaced.isOk() && replaced.value.slides[1]?.title).toBe("New");
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

	it("keeps the board's delay and the position when the event slide is rewritten", () => {
		const timed: TvConfig = {
			...CONFIG,
			slides: [manual("a"), { ...EVENT, duration: 45 }, manual("b")],
		};
		const resynced = upsertEventSlide(timed, {
			...EVENT,
			title: "New title",
			duration: 20,
		});
		expect(resynced.isOk() && resynced.value.slides[1]).toEqual({
			...EVENT,
			title: "New title",
			duration: 45,
		});
		expect(resynced.isOk() && ids(resynced.value)).toEqual([
			"a",
			"event-abc",
			"b",
		]);
	});

	it("appends a first-time event slide with the delay it carries", () => {
		const added = upsertEventSlide(CONFIG, {
			...EVENT,
			id: "event-def",
			event: "def",
			duration: 20,
		});
		expect(added.isOk() && added.value.slides[3]?.duration).toBe(20);
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
		const upserted = upsertEventSlide(config, { ...EVENT, title: "T" });
		expect(upserted.isOk() && upserted.value.slides.slice(0, 2)).toEqual([
			manual("abc"),
			stale,
		]);
		expect(upserted.isOk() && upserted.value.slides[2]?.title).toBe("T");
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

	it("accepts a save that changes only an event slide's duration", () => {
		const next: TvConfig = {
			...CONFIG,
			slides: CONFIG.slides.map((slide) =>
				slide === EVENT
					? { ...EVENT, duration: EVENT.duration + 25 }
					: slide
			),
		};
		expect(eventSlideProblems(CONFIG, next)).toEqual([]);
		for (const owned of [
			{ title: "Other" },
			{ src: "slides/other.html" },
			{ enabled: !EVENT.enabled },
		]) {
			const changed: TvConfig = {
				...CONFIG,
				slides: CONFIG.slides.map((slide) =>
					slide === EVENT
						? { ...EVENT, duration: 99, ...owned }
						: slide
				),
			};
			expect(eventSlideProblems(CONFIG, changed)).toHaveLength(2);
		}
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

	it("keeps an event slide's current delay and position", () => {
		const first = { ...EVENT, id: "event-one", event: "one", duration: 45 };
		const middle = {
			...EVENT,
			id: "event-two",
			event: "two",
			duration: 33,
		};
		const timed: TvConfig = {
			transition: "fade",
			slides: [first, manual("a"), manual("b"), middle, manual("c")],
		};
		const merged = withEventSlides(
			{
				transition: "none",
				slides: [manual("x"), manual("y"), manual("z"), manual("w")],
			},
			timed
		);
		expect(merged.isOk() && ids(merged.value)).toEqual([
			"event-one",
			"x",
			"y",
			"event-two",
			"z",
			"w",
		]);
		expect(merged.isOk() && merged.value.slides[0]).toEqual(first);
		expect(merged.isOk() && merged.value.slides[3]).toEqual(middle);
	});

	it("clamps an event slide's old position to a shorter import", () => {
		const last = { ...EVENT, duration: 45 };
		const merged = withEventSlides(
			{ transition: "none", slides: [manual("x")] },
			{
				transition: "fade",
				slides: [manual("a"), manual("b"), manual("c"), last],
			}
		);
		expect(merged.isOk() && ids(merged.value)).toEqual(["x", "event-abc"]);
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

describe("sameEventSlide", () => {
	it("ignores the board's delay but sees any other change", () => {
		expect(sameEventSlide({ ...EVENT, duration: 45 }, EVENT)).toBe(true);
		expect(sameEventSlide({ ...EVENT, title: "x" }, EVENT)).toBe(false);
		expect(sameEventSlide({ ...EVENT, enabled: false }, EVENT)).toBe(false);
	});
});
