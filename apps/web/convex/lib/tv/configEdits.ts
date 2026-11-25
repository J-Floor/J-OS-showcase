import { err, ok, type Result } from "neverthrow";

import type { TvError } from "../errors/tv.ts";

import type { ConfigProblem, TvConfig, TvConfigSlide } from "./configXml.ts";
import { TV_LIMITS } from "./constants.ts";

/** A board edit's outcome: the next config, or why it is refused. */
export type ConfigEdit = Result<TvConfig, TvError>;

export type SlideFields = {
	title?: string;
	duration?: number;
	enabled?: boolean;
	src?: string;
};

/** A slide an event owns. Only PR C's event sync writes these. */
export type EventSlide = TvConfigSlide & { source: "event"; event: string };

const FIELD_KEYS = ["title", "duration", "enabled", "src"] as const;

/** An event owns these on its slide; the board may only set its `duration`. */
const EVENT_LOCKED_KEYS = ["title", "src", "enabled"] as const;

const NUMBERED = /^slide-(\d+)$/;

export function isEventSlide(slide: Pick<TvConfigSlide, "source">): boolean {
	return slide.source === "event";
}

/** The index of slide `id`, manual or event. */
function slideIndex(config: TvConfig, id: string): Result<number, TvError> {
	const index = config.slides.findIndex((slide) => slide.id === id);
	return index === -1 ? err({ type: "TvSlideNotFound" }) : ok(index);
}

/** The index of the manual slide `id`; an event slide is never removed by hand. */
function manualIndex(config: TvConfig, id: string): Result<number, TvError> {
	return slideIndex(config, id).andThen((index) =>
		isEventSlide(config.slides[index])
			? err({ type: "TvEventSlideLocked" as const })
			: ok(index)
	);
}

function definedOnly(fields: SlideFields): SlideFields {
	const defined: SlideFields = {};
	for (const key of FIELD_KEYS) {
		const value = fields[key];
		if (value !== undefined) Object.assign(defined, { [key]: value });
	}
	return defined;
}

export function setSlideFields(
	config: TvConfig,
	id: string,
	fields: SlideFields
): ConfigEdit {
	return slideIndex(config, id)
		.andThen((index) =>
			isEventSlide(config.slides[index]) &&
			EVENT_LOCKED_KEYS.some((key) => fields[key] !== undefined)
				? err({ type: "TvEventSlideLocked" } as const)
				: ok(index)
		)
		.map((index) => ({
			...config,
			slides: config.slides.map((slide, at) =>
				at === index ? { ...slide, ...definedOnly(fields) } : slide
			),
		}));
}

/** Swaps with the neighbour (event slides included); a no-op at the ends. */
export function moveSlide(
	config: TvConfig,
	id: string,
	direction: "up" | "down"
): ConfigEdit {
	return slideIndex(config, id).map((index) => {
		const target = direction === "up" ? index - 1 : index + 1;
		if (target < 0 || target >= config.slides.length) return config;
		const slides = [...config.slides];
		slides.splice(target, 0, ...slides.splice(index, 1));
		return { ...config, slides };
	});
}

export function removeSlide(config: TvConfig, id: string): ConfigEdit {
	return manualIndex(config, id).map((index) => ({
		...config,
		slides: config.slides.filter((_, at) => at !== index),
	}));
}

export function appendSlide(
	config: TvConfig,
	slide: TvConfigSlide
): ConfigEdit {
	return isEventSlide(slide)
		? err({ type: "TvEventSlideLocked" })
		: appendChecked(config, slide);
}

/** Appends `slide` unless the TV is full or another slide has its id. */
function appendChecked(config: TvConfig, slide: TvConfigSlide): ConfigEdit {
	if (config.slides.length >= TV_LIMITS.maxSlides)
		return err({ type: "TvTooManySlides" });
	if (config.slides.some((other) => other.id === slide.id))
		return err({ type: "TvSlideInvalid" });
	return ok({ ...config, slides: [...config.slides, slide] });
}

/** `slide-<n>` one past the highest such id, so a removed number is never reused while a higher one exists. */
export function nextSlideId(config: TvConfig): string {
	const highest = config.slides.reduce((max, slide) => {
		const match = NUMBERED.exec(slide.id);
		return match ? Math.max(max, Number(match[1])) : max;
	}, 0);
	return `slide-${String(highest + 1)}`;
}

/** Event `slide.event`'s slide, replaced where it is or appended. */
export function upsertEventSlide(
	config: TvConfig,
	slide: EventSlide
): ConfigEdit {
	const index = config.slides.findIndex(
		(other) => isEventSlide(other) && other.event === slide.event
	);
	if (index !== -1) {
		// Another slide (a manual one) may not carry the id this event slide takes.
		if (
			config.slides.some(
				(other, at) => at !== index && other.id === slide.id
			)
		)
			return err({ type: "TvSlideInvalid" });
		return ok({
			...config,
			slides: config.slides.map((other, at) =>
				at === index ? { ...slide, duration: other.duration } : other
			),
		});
	}
	return appendChecked(config, slide);
}

/** The slides in the order of `ids`, which must name every current slide exactly once; the same order returns `config` itself (no write). */
export function reorderSlides(
	config: TvConfig,
	ids: readonly string[]
): ConfigEdit {
	const byId = new Map(config.slides.map((slide) => [slide.id, slide]));
	// A slide set that no longer matches the list the board saw: an event sync
	// added or removed a slide meanwhile.
	if (ids.length !== config.slides.length || new Set(ids).size !== ids.length)
		return err({ type: "TvConfigStale" });
	const slides: TvConfigSlide[] = [];
	for (const id of ids) {
		const slide = byId.get(id);
		if (!slide) return err({ type: "TvConfigStale" });
		slides.push(slide);
	}
	return slides.every((slide, at) => slide === config.slides[at])
		? ok(config)
		: ok({ ...config, slides });
}

export function removeEventSlides(config: TvConfig, eventId: string): TvConfig {
	return {
		...config,
		slides: config.slides.filter(
			(slide) => !(isEventSlide(slide) && slide.event === eventId)
		),
	};
}

function eventSlides(config: TvConfig): TvConfigSlide[] {
	return config.slides.filter((slide) => isEventSlide(slide));
}

/** What an event owns on its slide: everything but its place and its `duration`, which the board sets (`EVENT_LOCKED_KEYS` lists the same locked fields: keep the two in step). */
function eventKey(slide: TvConfigSlide): string {
	return JSON.stringify([
		slide.id,
		slide.type,
		slide.src,
		slide.enabled,
		slide.title,
		slide.event,
	]);
}

/** Both are the same event slide entry: every event-owned field equal (its place in the config and its delay do not count). */
export function sameEventSlide(
	left: TvConfigSlide,
	right: TvConfigSlide
): boolean {
	return eventKey(left) === eventKey(right) && left.source === right.source;
}

/** A board save (the XML editor) keeps every event-owned field of an event slide as it was (its place and its delay may change) and adds none. */
export function eventSlideProblems(
	saved: TvConfig,
	next: TvConfig
): ConfigProblem[] {
	const before = eventSlides(saved);
	const after = eventSlides(next);
	return [
		...unmatched(before, after).map((slide) => ({
			message: `Slide "${slide.id}" comes from an event: keep its title, file and shown setting as they were.`,
		})),
		...unmatched(after, before).map((slide) => ({
			message: `Slide "${slide.id}" says it comes from an event: only events can add those.`,
		})),
	];
}

/** The slides of `from` with no counterpart in `others`; counted, so a duplicated slide is seen. */
function unmatched(
	from: TvConfigSlide[],
	others: TvConfigSlide[]
): TvConfigSlide[] {
	const available = new Map<string, number>();
	for (const slide of others) {
		const key = eventKey(slide);
		available.set(key, (available.get(key) ?? 0) + 1);
	}
	return from.filter((slide) => {
		const key = eventKey(slide);
		const left = available.get(key) ?? 0;
		available.set(key, left - 1);
		return left <= 0;
	});
}

/** The one message for slides whose file is not among `paths` (the pack's files). */
export function missingFromPack(
	config: TvConfig,
	paths: ReadonlySet<string>
): string[] {
	return config.slides
		.filter((slide) => !paths.has(slide.src))
		.map(
			(slide) => `Slide "${slide.id}": ${slide.src} is not in the pack.`
		);
}

/** `missingFromPack` for the board editor, which can upload the file. */
export function missingSources(
	config: TvConfig,
	paths: ReadonlySet<string>
): ConfigProblem[] {
	return missingFromPack(config, paths).map((message) => ({
		message: `${message} Upload it first.`,
	}));
}

/** Said of an imported config that still carries event slides (`readPackZip` drops them first). */
const PACK_EVENT_SLIDES_MESSAGE =
	"config.xml in a pack cannot hold event slides.";

/**
 * A pack import: the imported slides, with the event slides already on the TV
 * kept as they are (delay included). Each goes back at the index it had before
 * the import, clamped to the new length, in ascending old index so they keep
 * their relative order. An import never carries its own.
 */
export function withEventSlides(
	imported: TvConfig,
	current: TvConfig
): Result<TvConfig, string[]> {
	if (imported.slides.some((slide) => isEventSlide(slide)))
		return err([PACK_EVENT_SLIDES_MESSAGE]);
	const events = eventSlides(current);
	const importedIds = new Set(imported.slides.map((slide) => slide.id));
	const clashes = events
		.filter((slide) => importedIds.has(slide.id))
		.map((slide) => `Slide id "${slide.id}" belongs to an event slide.`);
	if (clashes.length > 0) return err(clashes);
	const slides = [...imported.slides];
	for (const event of events) {
		const oldIndex = current.slides.findIndex(
			(slide) => slide.id === event.id
		);
		slides.splice(Math.min(oldIndex, slides.length), 0, event);
	}
	return slides.length > TV_LIMITS.maxSlides
		? err([
				`The TV can show at most ${String(TV_LIMITS.maxSlides)} slides, event slides included.`,
			])
		: ok({ ...imported, slides });
}
