import { XMLParser, XMLValidator } from "fast-xml-parser";
import { err, ok, type Result } from "neverthrow";

import { NAME_MAX } from "../validate.ts";

import { TV_LIMITS, TV_PACK_LIMITS } from "./constants.ts";
import { htmlBytes } from "./htmlBytes.ts";
import {
	extensionOf,
	IMAGE_EXTENSIONS,
	isSlidePath,
	SLIDE_ID,
} from "./packPaths.ts";

type TvTransition = "fade" | "slide" | "none";
type TvSlideType = "image" | "html";

/** One `<slide>`. `source`/`event` mark a slide an event owns (written by PR C only). */
export type TvConfigSlide = {
	id: string;
	type: TvSlideType;
	src: string;
	duration: number;
	enabled: boolean;
	title?: string;
	source?: "event";
	event?: string;
};

export type TvConfig = { transition: TvTransition; slides: TvConfigSlide[] };

/** Why config.xml was refused; `line` is 1-based when it is known. */
export type ConfigProblem = { message: string; line?: number };

/** A Convex document id: lowercase letters and digits. */
const EVENT_ID = /^[a-z0-9]{1,64}$/;
const DURATION = /^\d{1,3}$/;
const TRANSITIONS: readonly TvTransition[] = ["fade", "slide", "none"];
const TV_KEYS = new Set(["@_version", "@_transition", "slide"]);
const SLIDE_KEYS = new Set(
	[
		"id",
		"type",
		"src",
		"duration",
		"enabled",
		"title",
		"source",
		"event",
	].map((name) => `@_${name}`)
);
/** No DTD at all: entity expansion is the classic XML bomb. */
const DECLARATION = /<!(?:DOCTYPE|ENTITY)/i;
const COMMENT = /<!--[\s\S]*?-->/g;
/** `<slide` followed by a space, `/` or `>`: not `<slides>` or `<slide-x>`. */
const SLIDE_TAG = /<slide(?=[\s/>])/g;
const BYTES_PER_KB = 1024;

type RawNode = Record<string, unknown>;
type Attribute = (name: string) => string | undefined;

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	parseAttributeValue: false,
	parseTagValue: false,
	ignoreDeclaration: true,
	ignorePiTags: true,
	trimValues: true,
	isArray: (name) => name === "slide",
	htmlEntities: true,
});

/** "Line 3: ..." when the line is known, else the message. */
export function describeProblem(problem: ConfigProblem): string {
	return problem.line === undefined
		? problem.message
		: `Line ${String(problem.line)}: ${problem.message}`;
}

/** 1-based line of each `<slide` tag; comments are blanked first so a commented-out slide does not count. */
function slideLines(xml: string): number[] {
	const code = xml.replaceAll(COMMENT, (comment) =>
		comment.replaceAll(/[^\n]/g, " ")
	);
	return [...code.matchAll(SLIDE_TAG)].map(
		(match) => code.slice(0, match.index).split("\n").length
	);
}

function unknownKey(element: string, key: string): string {
	if (key === "#text") return `${element} cannot contain text.`;
	return key.startsWith("@_")
		? `Unknown attribute "${key.slice(2)}" on ${element}.`
		: `Unknown element <${key}> inside ${element}.`;
}

function isTransition(value: unknown): value is TvTransition {
	return TRANSITIONS.some((transition) => transition === value);
}

const RESERVED_SLIDE_ID = "new";

function idProblem(id: string): string | null {
	if (!SLIDE_ID.test(id))
		return `Slide id "${id}" must be lowercase letters, digits and dashes (at most 64).`;
	// The web app's `?slide=new` link opens the add form.
	return id === RESERVED_SLIDE_ID
		? `Slide id "${id}" is reserved. Pick another id.`
		: null;
}

function idProblems(id: string, get: Attribute): string[] {
	const problems: string[] = [];
	const problem = idProblem(id);
	if (problem !== null) problems.push(problem);
	const type = get("type");
	if (type !== "image" && type !== "html") {
		problems.push(`Slide "${id}": type must be image or html.`);
		return problems;
	}
	const sourcePath = get("src") ?? "";
	if (!isSlidePath(sourcePath))
		problems.push(
			`Slide "${id}": src must be slides/<name>.html, .png, .jpg, .jpeg, .webp or .gif.`
		);
	else if (type === "html" && extensionOf(sourcePath) !== "html")
		problems.push(`Slide "${id}": an html slide needs a .html file.`);
	else if (type === "image" && !IMAGE_EXTENSIONS.has(extensionOf(sourcePath)))
		problems.push(`Slide "${id}": an image slide needs an image file.`);
	return problems;
}

function isDuration(text: string): boolean {
	const seconds = Number(text);
	return (
		DURATION.test(text) &&
		seconds >= TV_LIMITS.durationMin &&
		seconds <= TV_LIMITS.durationMax
	);
}

function eventProblems(id: string, get: Attribute): string[] {
	const source = get("source");
	const event = get("event");
	const isPlain = source === undefined && event === undefined;
	const isEvent =
		source === "event" && event !== undefined && EVENT_ID.test(event);
	return isPlain || isEvent
		? []
		: [
				`Slide "${id}": source="event" needs an event id, and event is only allowed with it.`,
			];
}

function detailProblems(id: string, get: Attribute): string[] {
	const problems: string[] = [];
	const duration = get("duration");
	if (duration !== undefined && !isDuration(duration))
		problems.push(
			`Slide "${id}": duration must be a whole number of seconds from ${String(TV_LIMITS.durationMin)} to ${String(TV_LIMITS.durationMax)}.`
		);
	const enabled = get("enabled");
	if (enabled !== undefined && enabled !== "true" && enabled !== "false")
		problems.push(`Slide "${id}": enabled must be true or false.`);
	const title = get("title");
	if (title !== undefined && (title.trim() === "" || title.length > NAME_MAX))
		problems.push(
			`Slide "${id}": title must have text, at most ${String(NAME_MAX)} characters.`
		);
	return [...problems, ...eventProblems(id, get)];
}

function toSlide(get: Attribute): TvConfigSlide {
	const title = get("title")?.trim();
	const event = get("event");
	return {
		id: get("id") ?? "",
		type: get("type") === "html" ? "html" : "image",
		src: get("src") ?? "",
		duration: Number(get("duration") ?? TV_LIMITS.durationDefault),
		enabled: get("enabled") !== "false",
		...(title === undefined ? {} : { title }),
		...(event === undefined ? {} : { source: "event" as const, event }),
	};
}

/** One `<slide>`: the slide, or its problems (all on the slide's line). */
function readSlide(
	raw: unknown,
	line: number | undefined
): Result<TvConfigSlide, ConfigProblem[]> {
	function at(message: string): ConfigProblem {
		return line === undefined ? { message } : { message, line };
	}
	if (typeof raw !== "object" || raw === null)
		return err([at("A <slide> needs id, type and src.")]);
	const node = raw as RawNode;
	function get(name: string): string | undefined {
		const value = node[`@_${name}`];
		return typeof value === "string" ? value : undefined;
	}
	const id = get("id") ?? "";
	const messages = [
		...Object.keys(node)
			.filter((key) => !SLIDE_KEYS.has(key))
			.map((key) => unknownKey("<slide>", key)),
		...idProblems(id, get),
		...detailProblems(id, get),
	];
	return messages.length > 0
		? err(messages.map((message) => at(message)))
		: ok(toSlide(get));
}

function rootProblems(node: RawNode, slideCount: number): ConfigProblem[] {
	const messages = Object.keys(node)
		.filter((key) => !TV_KEYS.has(key))
		.map((key) => unknownKey("<tv>", key));
	if (node["@_version"] !== "1") messages.push('<tv> needs version="1".');
	const transition = node["@_transition"];
	if (transition !== undefined && !isTransition(transition))
		messages.push("<tv> transition must be fade, slide or none.");
	if (slideCount > TV_LIMITS.maxSlides)
		messages.push(
			`The TV can show at most ${String(TV_LIMITS.maxSlides)} slides.`
		);
	return messages.map((message) => ({ message }));
}

function duplicateProblems(
	slides: { slide: TvConfigSlide; line: number | undefined }[]
): ConfigProblem[] {
	const seen = new Set<string>();
	const problems: ConfigProblem[] = [];
	for (const { slide, line } of slides) {
		if (seen.has(slide.id)) {
			const message = `Slide id "${slide.id}" is used twice.`;
			problems.push(line === undefined ? { message } : { message, line });
		}
		seen.add(slide.id);
	}
	return problems;
}

/** Every `<slide>`: the ones that read cleanly, and all the problems found. */
function readSlides(
	rawSlides: unknown[],
	lines: number[]
): { slides: TvConfigSlide[]; problems: ConfigProblem[] } {
	const read: { slide: TvConfigSlide; line: number | undefined }[] = [];
	const problems: ConfigProblem[] = [];
	for (const [index, raw] of rawSlides.entries()) {
		const result = readSlide(raw, lines[index]);
		if (result.isOk())
			read.push({ slide: result.value, line: lines[index] });
		else problems.push(...result.error);
	}
	return {
		slides: read.map((entry) => entry.slide),
		problems: [...problems, ...duplicateProblems(read)],
	};
}

/** Why `<tv>` cannot be read as an element at all (repeated, or just text), if so. */
function rootShapeProblem(root: unknown): string | undefined {
	if (Array.isArray(root)) return "The root element must be <tv>, once.";
	return typeof root === "string" && root !== ""
		? "<tv> cannot contain text."
		: undefined;
}

function readRoot(
	document: RawNode,
	lines: number[]
): Result<TvConfig, ConfigProblem[]> {
	const keys = Object.keys(document);
	if (keys.length !== 1 || keys[0] !== "tv")
		return err([{ message: "The root element must be <tv>." }]);
	const root = document.tv;
	const shape = rootShapeProblem(root);
	if (shape) return err([{ message: shape }]);
	const node: RawNode =
		typeof root === "object" && root !== null ? (root as RawNode) : {};
	const rawSlides: unknown[] = Array.isArray(node.slide) ? node.slide : [];
	const read = readSlides(rawSlides, lines);
	const problems = [
		...rootProblems(node, rawSlides.length),
		...read.problems,
	];
	const transition = isTransition(node["@_transition"])
		? node["@_transition"]
		: "fade";
	return problems.length > 0
		? err(problems)
		: ok({ transition, slides: read.slides });
}

/** Parses and validates config.xml against the strict pack schema. */
export function parseConfigXml(xml: string): Result<TvConfig, ConfigProblem[]> {
	if (htmlBytes(xml) > TV_PACK_LIMITS.configMaxBytes)
		return err([
			{
				message: `config.xml is larger than ${String(TV_PACK_LIMITS.configMaxBytes / BYTES_PER_KB)} KB.`,
			},
		]);
	if (DECLARATION.test(xml))
		return err([
			{ message: "config.xml cannot declare a DOCTYPE or entities." },
		]);
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- the parser alone accepts malformed XML; this is the syntax check fast-xml-parser ships
	const valid = XMLValidator.validate(xml, { allowBooleanAttributes: false });
	return valid === true
		? readRoot(parser.parse(xml) as RawNode, slideLines(xml))
		: err([{ message: valid.err.msg, line: valid.err.line }]);
}

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
	// A parser normalises raw whitespace in an attribute value to spaces.
	"\r": "&#13;",
	"\n": "&#10;",
	"\t": "&#9;",
};

function escapeAttribute(value: string): string {
	return value.replaceAll(
		/[&<>"'\r\n\t]/g,
		(character) => ESCAPES[character] ?? character
	);
}

function slideAttributes(slide: TvConfigSlide): string {
	const pairs: [string, string | undefined][] = [
		["id", slide.id],
		["type", slide.type],
		["src", slide.src],
		["duration", String(slide.duration)],
		["enabled", String(slide.enabled)],
		["title", slide.title],
		["source", slide.source],
		["event", slide.event],
	];
	return pairs
		.filter((pair): pair is [string, string] => pair[1] !== undefined)
		.map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
		.join(" ");
}

/** The one canonical form every saved config.xml is stored and shipped in. */
export function serializeConfig(config: TvConfig): string {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<tv version="1" transition="${config.transition}">`,
		...config.slides.map((slide) => `  <slide ${slideAttributes(slide)}/>`),
		"</tv>",
		"",
	].join("\n");
}
