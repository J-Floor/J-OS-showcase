import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { measureLeaves } from "./skeletonMeasure.ts";

/** jsdom has no layout, so each box is declared: elements carry
 *  `data-rect="left,top,width,height"`, and the temporary spans the measure
 *  creates around text are looked up by their text. */
const textRects = new Map<string, string>();

function rectFrom(spec: string | null | undefined): DOMRect {
	const [left, top, width, height] = (spec ?? "0,0,0,0")
		.split(",")
		.map(Number);
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
	} as DOMRect;
}

beforeEach(() => {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function (this: Element) {
			return rectFrom(
				this.getAttribute("data-rect") ??
					textRects.get(this.textContent)
			);
		}
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	textRects.clear();
	document.body.innerHTML = "";
});

function container(html: string): HTMLElement {
	const element = document.createElement("div");
	element.dataset.rect = "10,20,300,200";
	element.innerHTML = html;
	document.body.append(element);
	return element;
}

test("a text element is measured at its text's width, relative to the container", () => {
	textRects.set("Hello", "30,50,40,16");
	const root = container(
		'<p data-rect="10,40,300,30" style="border-radius: 6px">Hello</p>'
	);
	expect(measureLeaves(root)).toEqual([
		{ x: 20, y: 30, width: 40, height: 16, borderRadius: "6px" },
	]);
});

test("measuring leaves the text where it was", () => {
	textRects.set("Hello", "30,50,40,16");
	const root = container('<p data-rect="10,40,300,30">Hello</p>');
	const paragraph = root.firstElementChild!;
	const text = paragraph.firstChild;
	measureLeaves(root);
	expect(paragraph.childNodes).toHaveLength(1);
	expect(paragraph.firstChild).toBe(text);
});

test("an element with an inline child is one leaf, boxed as a whole", () => {
	const root = container(
		'<p data-rect="10,40,200,20">Some <strong>bold</strong> text</p>'
	);
	const [leaf] = measureLeaves(root);
	expect(leaf).toMatchObject({ x: 0, y: 20, borderRadius: "0px" });
});

test("a button is a leaf at its own box even with markup inside", () => {
	const root = container(
		'<button data-rect="15,25,80,32"><div data-rect="15,25,10,10"></div></button>'
	);
	const leaves = measureLeaves(root);
	expect(leaves).toHaveLength(1);
	expect(leaves[0]).toMatchObject({ width: 80, height: 32 });
});

test("an icon is sized by its font size, not by the box its glyph reports", () => {
	const root = container(
		'<span data-icon data-rect="12,22,3,3" style="font-size: 20px"></span>'
	);
	expect(measureLeaves(root)).toEqual([
		{ x: 2, y: 2, width: 20, height: 20, borderRadius: "0px" },
	]);
});

test("an icon with no readable font size falls back to a default size", () => {
	const root = container('<span data-icon data-rect="10,20,3,3"></span>');
	expect(measureLeaves(root)).toMatchObject([{ width: 16, height: 16 }]);
});

test.each([
	["an element with no width", '<p data-rect="10,20,0,10">Empty</p>'],
	["an element with no height", '<p data-rect="10,20,10,0">Flat</p>'],
	[
		"a nested shimmer container",
		'<div data-shimmer-container="true" data-rect="10,20,100,100"><p data-rect="10,20,100,10">Inside</p></div>',
	],
	[
		"a display: contents wrapper with only blank text",
		'<div style="display: contents">   </div>',
	],
])("%s produces nothing", (_name, html) => {
	expect(measureLeaves(container(html))).toEqual([]);
});

test("mixed content keeps its elements and its loose text, in order", () => {
	textRects.set("Loose words", "40,100,60,14");
	const root = container(
		'<section data-rect="10,20,300,100"><div data-rect="10,20,100,30"><i data-icon style="font-size: 10px" data-rect="10,20,1,1"></i></div>Loose words</section>'
	);
	const leaves = measureLeaves(root);
	expect(leaves).toEqual([
		{ x: 0, y: 0, width: 100, height: 30, borderRadius: "0px" },
		{ x: 30, y: 80, width: 60, height: 14, borderRadius: "0px" },
	]);
	const section = root.firstElementChild!;
	expect(section.lastChild?.textContent).toBe("Loose words");
	expect(section.lastChild?.nodeType).toBe(Node.TEXT_NODE);
});

test("blank text between elements is not measured", () => {
	const root = container(
		'<section data-rect="10,20,300,100"><div data-rect="10,20,100,30"><i data-icon style="font-size: 10px" data-rect="10,20,1,1"></i></div>   </section>'
	);
	expect(measureLeaves(root)).toHaveLength(1);
});

test("a display: contents wrapper lends its children's boxes and its own bare text", () => {
	textRects.set("Bare", "50,60,24,12");
	const root = container(
		'<div style="display: contents" data-rect="0,0,0,0"><button data-rect="10,20,70,30"></button></div><div style="display: contents">Bare</div>'
	);
	expect(measureLeaves(root)).toEqual([
		{ x: 0, y: 0, width: 70, height: 30, borderRadius: "0px" },
		{ x: 40, y: 40, width: 24, height: 12, borderRadius: "0px" },
	]);
});
