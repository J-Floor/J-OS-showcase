import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MORPH_HIDDEN } from "./morphNames.ts";
import {
	clipInset,
	isFullyVisible,
	nearestVisibleAnchor,
	visibleRect,
} from "./visibleArea.ts";

function box(
	element: HTMLElement,
	x: number,
	y: number,
	width: number,
	height: number
) {
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
		new DOMRect(x, y, width, height)
	);
}

beforeEach(() => {
	vi.stubGlobal("innerWidth", 1280);
	vi.stubGlobal("innerHeight", 900);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

test("the viewport clips too", () => {
	const cell = document.createElement("span");
	document.body.append(cell);
	box(cell, 1200, 10, 200, 20);
	expect(visibleRect(cell).width).toBe(80);
});

/** A row 1300 wide inside a scroller showing x 100..1200 (horizontal scroll). */
function scrolledRow(): HTMLElement {
	const scroller = document.createElement("div");
	scroller.style.overflowX = "auto";
	const row = document.createElement("div");
	scroller.append(row);
	document.body.append(scroller);
	box(scroller, 100, 0, 1100, 800);
	box(row, -150, 300, 1300, 50);
	return row;
}

test("a row wider than its scroller is cut to the scroller's visible part", () => {
	const row = scrolledRow();
	const rect = visibleRect(row);
	expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
		100, 300, 1050, 50,
	]);
	expect(isFullyVisible(row)).toBe(false);
});

test("the inset that clips a snapshot of the full box to its visible part", () => {
	expect(clipInset(scrolledRow())).toBe("inset(0px 0px 0px 250px)");
});

test("an element inside a non-clipping parent is its own box, fully visible", () => {
	const parent = document.createElement("div");
	const cell = document.createElement("span");
	parent.append(cell);
	document.body.append(parent);
	box(parent, 0, 0, 50, 50);
	box(cell, 10, 10, 200, 20);
	expect(isFullyVisible(cell)).toBe(true);
	expect(clipInset(cell)).toBe("none");
});

function byId(id: string): HTMLElement | null {
	return document.getElementById(id);
}

describe("nearestVisibleAnchor", () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
			length: 1,
		} as DOMRectList);
	});

	test("a visible element is its own anchor", () => {
		document.body.innerHTML = `<button id="b">x</button>`;
		expect(nearestVisibleAnchor(byId("b"))?.id).toBe("b");
	});

	test("an item in a closed popup anchors to the popup's trigger", () => {
		document.body.innerHTML = `<button id="more" aria-controls="other menu">More</button>
			<div id="menu" role="menu" style="visibility: hidden"><div role="menuitem" id="edit">Edit</div></div>`;
		expect(nearestVisibleAnchor(byId("edit"))?.id).toBe("more");
	});

	test("an item in a closed submenu anchors to the first visible trigger up the chain", () => {
		document.body.innerHTML = `<button id="more" aria-controls="menu">More</button>
			<div id="menu" style="visibility: hidden">
				<div role="menuitem" id="sub-trigger" aria-controls="sub">Move</div>
				<div id="sub" style="opacity: 0"><div role="menuitem" id="item">Up</div></div>
			</div>`;
		expect(nearestVisibleAnchor(byId("item"))?.id).toBe("more");
	});

	test("an element faded out by an ancestor is not visible", () => {
		document.body.innerHTML = `<div style="opacity: 0"><button id="b">x</button></div>`;
		expect(nearestVisibleAnchor(byId("b"))).toBeNull();
	});

	test("a morph source hidden while its overlay is open still counts as visible", () => {
		document.body.innerHTML = `<div role="row" id="row" ${MORPH_HIDDEN} style="visibility: hidden">x</div>`;
		expect(nearestVisibleAnchor(byId("row"))?.id).toBe("row");
	});

	test("a hidden morph source inside a closed popup anchors to its trigger", () => {
		document.body.innerHTML = `<button id="more" aria-controls="menu">More</button>
			<div id="menu" style="visibility: hidden"><div role="menuitem" id="edit" ${MORPH_HIDDEN} style="visibility: hidden">Edit</div></div>`;
		expect(nearestVisibleAnchor(byId("edit"))?.id).toBe("more");
	});

	test("a hidden morph source faded out itself is not visible", () => {
		document.body.innerHTML = `<div role="row" id="row" ${MORPH_HIDDEN} style="visibility: hidden; opacity: 0">x</div>`;
		expect(nearestVisibleAnchor(byId("row"))).toBeNull();
	});

	test("of several controls naming the popup, the visible one is the trigger", () => {
		document.body.innerHTML = `<button id="hidden-copy" aria-controls="menu" style="visibility: hidden">More</button>
			<button id="more" aria-controls="menu">More</button>
			<div id="menu" style="visibility: hidden"><div role="menuitem" id="edit">Edit</div></div>`;
		expect(nearestVisibleAnchor(byId("edit"))?.id).toBe("more");
	});

	test("an item of a menu unmounted on close anchors to the trigger that still names it", () => {
		// Ark drops `aria-controls` while the content is unmounted; `data-controls` stays.
		document.body.innerHTML = `<button id="more" data-controls="menu">More</button>`;
		const menu = document.createElement("div");
		menu.id = "menu";
		const item = document.createElement("div");
		item.setAttribute("role", "menuitem");
		menu.append(item);
		expect(nearestVisibleAnchor(item)?.id).toBe("more");
	});

	test("an element with no layout box and no popup has no anchor", () => {
		document.body.innerHTML = `<button id="b">x</button>`;
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
			length: 0,
		} as DOMRectList);
		expect(nearestVisibleAnchor(byId("b"))).toBeNull();
	});

	test("a detached element or null has no anchor", () => {
		expect(
			nearestVisibleAnchor(document.createElement("button"))
		).toBeNull();
		expect(nearestVisibleAnchor(null)).toBeNull();
	});

	test("uses the browser's own visibility check when it has one", () => {
		document.body.innerHTML = `<button id="b">x</button>`;
		const button = byId("b");
		const isVisibleSpy = vi.fn(() => false);
		Object.assign(button ?? {}, { checkVisibility: isVisibleSpy });
		expect(nearestVisibleAnchor(button)).toBeNull();
		expect(isVisibleSpy).toHaveBeenCalledWith({
			visibilityProperty: true,
			opacityProperty: true,
		});
	});
});
