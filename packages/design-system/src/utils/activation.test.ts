import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { mockLayoutBoxes } from "../test/viewTransitionFakes.ts";

import {
	ACTIVATION_TTL_MS,
	recentActivation,
	trackActivation,
} from "./activation.ts";

let uninstall: () => void;

beforeEach(() => {
	uninstall = trackActivation();
	// jsdom has no layout; every element is "on screen" for these tests.
	mockLayoutBoxes();
});

afterEach(() => {
	uninstall();
	vi.useRealTimers();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

test("records the closest activatable ancestor on pointerdown", () => {
	document.body.innerHTML = `<table><tr role="row" id="row"><td><span id="cell">x</span></td></tr></table>`;
	document
		.getElementById("cell")
		?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	expect(recentActivation()?.id).toBe("row");
});

test("records a button activated with Enter", () => {
	document.body.innerHTML = `<button id="new">New</button>`;
	document
		.getElementById("new")
		?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
		);
	expect(recentActivation()?.id).toBe("new");
});

test("ignores other keys", () => {
	document.body.innerHTML = `<button id="new">New</button>`;
	document
		.getElementById("new")
		?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "a", bubbles: true })
		);
	expect(recentActivation()).toBeNull();
});

test("forgets an activation older than the time limit", () => {
	vi.useFakeTimers();
	document.body.innerHTML = `<button id="new">New</button>`;
	document
		.getElementById("new")
		?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	vi.advanceTimersByTime(ACTIVATION_TTL_MS + 1);
	expect(recentActivation()).toBeNull();
});

test("ignores an element that left the document", () => {
	document.body.innerHTML = `<button id="new">New</button>`;
	const button = document.getElementById("new");
	button?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	button?.remove();
	expect(recentActivation()).toBeNull();
});

test("ignores an element that is not rendered", () => {
	document.body.innerHTML = `<button id="new">New</button>`;
	const button = document.getElementById("new");
	button?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 0,
	} as DOMRectList);
	expect(recentActivation()).toBeNull();
});
