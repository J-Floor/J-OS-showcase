import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { clipInset, isFullyVisible, visibleRect } from "./visibleArea.ts";

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
