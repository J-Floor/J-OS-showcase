import { describe, expect, it } from "vitest";

import {
	type ConfigProblem,
	describeProblem,
	parseConfigXml,
	serializeConfig,
	type TvConfig,
	type TvConfigSlide,
} from "./configXml.ts";
import { TV_LIMITS } from "./constants.ts";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<tv version="1" transition="fade">
  <slide id="opinions-1" type="image" src="slides/opinions-1.png" duration="15" enabled="true" title="Opinions"/>
  <slide id="event-abc" type="html" src="slides/event-abc.html" duration="20" source="event" event="abc"/>
</tv>
`;

function problemsOf(xml: string): ConfigProblem[] {
	const result = parseConfigXml(xml);
	expect(result.isErr()).toBe(true);
	return result.isErr() ? result.error : [];
}

function slideXml(attributes: string): string {
	return `<tv version="1">\n<slide ${attributes}/>\n</tv>`;
}

describe("parseConfigXml", () => {
	it("reads the spec example", () => {
		const result = parseConfigXml(SAMPLE);
		expect(result.isOk() && result.value).toEqual({
			transition: "fade",
			slides: [
				{
					id: "opinions-1",
					type: "image",
					src: "slides/opinions-1.png",
					duration: 15,
					enabled: true,
					title: "Opinions",
				},
				{
					id: "event-abc",
					type: "html",
					src: "slides/event-abc.html",
					duration: 20,
					enabled: true,
					source: "event",
					event: "abc",
				},
			],
		});
	});

	it("defaults transition, duration and enabled", () => {
		const result = parseConfigXml(
			slideXml('id="a" type="image" src="slides/a.png"')
		);
		expect(result.isOk() && result.value).toEqual({
			transition: "fade",
			slides: [
				{
					id: "a",
					type: "image",
					src: "slides/a.png",
					duration: TV_LIMITS.durationDefault,
					enabled: true,
				},
			],
		});
	});

	it("reports a syntax error with its line", () => {
		const [problem] = problemsOf('<tv version="1">\n<slide id="a"\n</tv>');
		expect(problem.line).toBeGreaterThanOrEqual(2);
	});

	it("reports a schema error with the slide's line", () => {
		const problems = problemsOf(
			'<tv version="1">\n<slide id="a" type="image" src="slides/a.png"/>\n<slide id="b" type="video" src="slides/b.png"/>\n</tv>'
		);
		expect(problems).toEqual([
			{ message: 'Slide "b": type must be image or html.', line: 3 },
		]);
	});

	it.each([
		['<tv version="2"/>', 'needs version="1"'],
		['<tv version="1" transition="spin"/>', "transition"],
		['<tv version="1"><other/></tv>', "Unknown element <other>"],
		['<tv version="1" colour="red"/>', 'Unknown attribute "colour"'],
		['<tv version="1">text</tv>', "cannot contain text"],
		["<show/>", "root element must be <tv>"],
		[
			slideXml('id="a" type="image" src="slides/a.png" foo="1"'),
			'Unknown attribute "foo"',
		],
		[slideXml('id="A b" type="image" src="slides/a.png"'), "Slide id"],
		[slideXml('id="a" type="image" src="slides/../a.png"'), "src must be"],
		[slideXml('id="a" type="image" src="assets/a.png"'), "src must be"],
		[slideXml('id="a" type="image" src="slides/a.svg"'), "src must be"],
		[
			slideXml('id="a" type="html" src="slides/a.png"'),
			"needs a .html file",
		],
		[
			slideXml('id="a" type="image" src="slides/a.html"'),
			"needs an image file",
		],
		[
			slideXml('id="a" type="image" src="slides/a.png" duration="4"'),
			"duration",
		],
		[
			slideXml('id="a" type="image" src="slides/a.png" duration="1.5"'),
			"duration",
		],
		[
			slideXml('id="a" type="image" src="slides/a.png" enabled="yes"'),
			"enabled",
		],
		[slideXml('id="a" type="image" src="slides/a.png" title=" "'), "title"],
		[
			slideXml('id="a" type="image" src="slides/a.png" source="event"'),
			"source",
		],
		[
			slideXml('id="a" type="image" src="slides/a.png" event="abc"'),
			"source",
		],
		[
			slideXml(
				'id="a" type="image" src="slides/a.png" source="manual" event="abc"'
			),
			"source",
		],
		['<!DOCTYPE tv [<!ENTITY x "y">]><tv version="1"/>', "DOCTYPE"],
	])("refuses %s", (xml, fragment) => {
		const messages = problemsOf(xml).map((problem) => problem.message);
		expect(messages.join("\n")).toContain(fragment);
	});

	it("refuses duplicate slide ids", () => {
		const xml = `<tv version="1">\n<slide id="a" type="image" src="slides/a.png"/>\n<slide id="a" type="image" src="slides/b.png"/>\n</tv>`;
		expect(problemsOf(xml)[0]?.message).toContain('"a" is used twice');
	});

	it("refuses the id new, which the app uses for its create link", () => {
		const xml = `<tv version="1">\n<slide id="new" type="image" src="slides/a.png"/>\n</tv>`;
		expect(problemsOf(xml)[0]?.message).toContain('"new" is reserved');
	});

	it("refuses more slides than the TV shows", () => {
		const slides = Array.from(
			{ length: TV_LIMITS.maxSlides + 1 },
			(_, index) =>
				`<slide id="s${String(index)}" type="image" src="slides/s${String(index)}.png"/>`
		).join("\n");
		expect(
			problemsOf(`<tv version="1">${slides}</tv>`)[0]?.message
		).toContain(String(TV_LIMITS.maxSlides));
	});

	it("refuses an oversize document before parsing it", () => {
		const padding = `<!--${"x".repeat(70_000)}-->`;
		expect(problemsOf(`${padding}<tv version="1"/>`)[0]?.message).toContain(
			"config.xml is larger"
		);
	});

	it("does not count a commented-out slide when placing lines", () => {
		const xml = `<tv version="1">\n<!-- <slide id="old"/> -->\n<slide id="b" type="video" src="slides/b.png"/>\n</tv>`;
		expect(problemsOf(xml)[0]?.line).toBe(3);
	});
});

describe("serializeConfig", () => {
	const eventSlide: TvConfigSlide = {
		id: "event-abc",
		type: "html",
		src: "slides/event-abc.html",
		duration: 20,
		enabled: true,
		source: "event",
		event: "abc",
	};
	const config: TvConfig = {
		transition: "slide",
		slides: [
			{
				id: "a",
				type: "image",
				src: "slides/a.png",
				duration: 15,
				enabled: false,
				title: `Tom & "Jerry" <3 'x'`,
			},
			eventSlide,
		],
	};

	it("round-trips through the parser, escapes included", () => {
		const parsed = parseConfigXml(serializeConfig(config));
		expect(parsed.isOk() && parsed.value).toEqual(config);
	});

	it("round-trips an empty show", () => {
		const empty: TvConfig = { transition: "none", slides: [] };
		const parsed = parseConfigXml(serializeConfig(empty));
		expect(parsed.isOk() && parsed.value).toEqual(empty);
	});

	it("writes one canonical form", () => {
		expect(serializeConfig({ transition: "fade", slides: [eventSlide] }))
			.toBe(`<?xml version="1.0" encoding="UTF-8"?>
<tv version="1" transition="fade">
  <slide id="event-abc" type="html" src="slides/event-abc.html" duration="20" enabled="true" source="event" event="abc"/>
</tv>
`);
	});
});

describe("config.xml problems", () => {
	it("does not count an element that only starts with slide as a slide line", () => {
		const problems = problemsOf(
			'<tv version="1">\n<slide-x/>\n<slide id="Bad" type="image" src="slides/a.png"/>\n</tv>'
		);
		expect(
			problems.flatMap((problem) =>
				problem.line === undefined ? [] : [problem.line]
			)
		).toEqual([3]);
	});

	it("names a second root plainly", () => {
		expect(problemsOf('<tv version="1"/>\n<tv version="1"/>')).toEqual([
			{ message: "The root element must be <tv>, once." },
		]);
	});

	it("puts the line of the repeated slide on a duplicate id", () => {
		const problems = problemsOf(
			'<tv version="1">\n<slide id="a" type="image" src="slides/a.png"/>\n<slide id="a" type="image" src="slides/b.png"/>\n</tv>'
		);
		expect(problems).toEqual([
			{ message: 'Slide id "a" is used twice.', line: 3 },
		]);
	});

	it("writes line breaks and tabs in an attribute as character references and reads them back", () => {
		const config: TvConfig = {
			transition: "fade",
			slides: [
				{
					id: "a",
					type: "image",
					src: "slides/a.png",
					duration: 15,
					enabled: true,
					title: "one\ntwo\tthree\rfour",
				},
			],
		};
		const xml = serializeConfig(config);
		expect(xml).toContain('title="one&#10;two&#9;three&#13;four"');
		const parsed = parseConfigXml(xml);
		expect(parsed.isOk() && parsed.value).toEqual(config);
	});
});

describe("describeProblem", () => {
	it("prefixes the line when there is one", () => {
		expect(describeProblem({ message: "Bad.", line: 4 })).toBe(
			"Line 4: Bad."
		);
		expect(describeProblem({ message: "Bad." })).toBe("Bad.");
	});
});
