import { matchesKeyboardEvent } from "@tanstack/solid-hotkeys";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { mockLayoutBoxes } from "../test/viewTransitionFakes.ts";

import {
	ACTIVATION_TTL_MS,
	isActivationThroughPopup,
	keyShortcutsOf,
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

test("records the active descendant a focused widget names on Enter", () => {
	document.body.innerHTML = `<table id="grid" tabindex="0" aria-activedescendant="r1"><tr role="row" id="r1"><td>x</td></tr></table>`;
	document
		.getElementById("grid")
		?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
		);
	expect(recentActivation()?.id).toBe("r1");
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

function press(target: Element | null, init: KeyboardEventInit): void {
	target?.dispatchEvent(
		new KeyboardEvent("keydown", { bubbles: true, ...init })
	);
}

test("records a menu item picked from the keyboard", () => {
	document.body.innerHTML = `<div role="menu" id="menu" tabindex="0" aria-activedescendant="edit"><div role="menuitem" id="edit">Edit</div></div>`;
	press(document.getElementById("menu"), { key: "Enter" });
	expect(recentActivation()?.id).toBe("edit");
});

test("records an element with an interactive role", () => {
	document.body.innerHTML = `<div role="tab" id="tab"><span id="label">Tab</span></div>`;
	document
		.getElementById("label")
		?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	expect(recentActivation()?.id).toBe("tab");
});

test("a shortcut key records the button showing that shortcut", () => {
	document.body.innerHTML = `<button id="new" aria-keyshortcuts="N">New</button>`;
	press(document.body, { key: "n", code: "KeyN" });
	expect(recentActivation()?.id).toBe("new");
});

test("a shortcut matches any of the listed shortcuts and its modifiers", () => {
	document.body.innerHTML = `<button id="find" aria-keyshortcuts="F Control+K">Find</button>`;
	press(document.body, { key: "k", code: "KeyK", ctrlKey: true });
	expect(recentActivation()?.id).toBe("find");
});

test("a shortcut prefers the button inside the focused row", () => {
	document.body.innerHTML = `<table>
		<tr role="row" id="r1"><td><button id="d1" aria-keyshortcuts="D">x</button></td></tr>
		<tr role="row" id="r2" tabindex="0"><td><button id="d2" aria-keyshortcuts="D">x</button></td></tr>
	</table>`;
	press(document.getElementById("r2"), { key: "d", code: "KeyD" });
	expect(recentActivation()?.id).toBe("d2");
});

test("a shortcut from the grid resolves inside its active row", () => {
	document.body.innerHTML = `<table id="grid" tabindex="0" aria-activedescendant="r2">
		<tr role="row" id="r1"><td><button id="d1" aria-keyshortcuts="D">x</button></td></tr>
		<tr role="row" id="r2"><td><button id="d2" aria-keyshortcuts="D">x</button></td></tr>
	</table>`;
	press(document.getElementById("grid"), { key: "d", code: "KeyD" });
	expect(recentActivation()?.id).toBe("d2");
});

test("a focused row without the shortcut falls back to the page's own button", () => {
	document.body.innerHTML = `<button id="new" aria-keyshortcuts="N">New</button>
		<table><tr role="row" id="r1" tabindex="0"><td>x</td></tr>
		<tr role="row"><td><button aria-keyshortcuts="N">x</button></td></tr></table>`;
	press(document.getElementById("r1"), { key: "n", code: "KeyN" });
	expect(recentActivation()?.id).toBe("new");
});

test("focus inside an overlay prefers the overlay's own button", () => {
	document.body.innerHTML = `<button id="page" aria-keyshortcuts="E">Edit</button>
		<div role="dialog" data-state="open" data-shortcut-surface id="sheet" tabindex="0"><button id="own" aria-keyshortcuts="E">Edit</button></div>`;
	press(document.getElementById("sheet"), { key: "e", code: "KeyE" });
	expect(recentActivation()?.id).toBe("own");
});

test("outside a row, a shortcut ignores the buttons of rows", () => {
	document.body.innerHTML = `<table><tr role="row"><td><button aria-keyshortcuts="D">x</button></td></tr></table>`;
	press(document.body, { key: "d", code: "KeyD" });
	expect(recentActivation()).toBeNull();
});

test("a key typed into a field records nothing", () => {
	document.body.innerHTML = `<input id="field" /><button aria-keyshortcuts="N">New</button>`;
	press(document.getElementById("field"), { key: "n", code: "KeyN" });
	expect(recentActivation()).toBeNull();
});

test("a key no shortcut on screen matches records nothing", () => {
	document.body.innerHTML = `<button aria-keyshortcuts="N">New</button>`;
	press(document.body, { key: "m", code: "KeyM" });
	expect(recentActivation()).toBeNull();
});

test("a dead key matches its shortcut by the physical key, as the binding does", () => {
	document.body.innerHTML = `<button id="del" aria-keyshortcuts="D">Delete</button>`;
	press(document.body, { key: "Dead", code: "KeyD" });
	expect(recentActivation()?.id).toBe("del");
});

test("a non-Latin letter records exactly when the binding's matcher fires", () => {
	document.body.innerHTML = `<button id="del" aria-keyshortcuts="D">Delete</button>`;
	const init = { key: "в", code: "KeyD", bubbles: true };
	const isFired = matchesKeyboardEvent(
		new KeyboardEvent("keydown", init),
		"D"
	);
	press(document.body, init);
	expect(recentActivation()?.id ?? null).toBe(isFired ? "del" : null);
});

test("a held key's repeats record nothing", () => {
	document.body.innerHTML = `<button aria-keyshortcuts="N">New</button>`;
	press(document.body, { key: "n", code: "KeyN", repeat: true });
	expect(recentActivation()).toBeNull();
});

test("a lone modifier or a navigation key records nothing", () => {
	document.body.innerHTML = `<button aria-keyshortcuts="N">New</button>`;
	press(document.body, { key: "Shift", code: "ShiftLeft", shiftKey: true });
	press(document.body, { key: "Alt", code: "AltLeft", altKey: true });
	press(document.body, { key: "Escape", code: "Escape" });
	press(document.body, { key: "ArrowDown", code: "ArrowDown" });
	expect(recentActivation()).toBeNull();
});

test("an activation inside a closed popup resolves to the popup's trigger", () => {
	document.body.innerHTML = `<button id="more" aria-controls="menu">More</button><div id="menu" role="menu" style="visibility: hidden"><div role="menuitem" id="edit">Edit</div></div>`;
	document
		.getElementById("edit")
		?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	expect(recentActivation()?.id).toBe("more");
	expect(isActivationThroughPopup()).toBe(true);
});

test("a press on a popup's trigger itself is not through the popup", () => {
	document.body.innerHTML = `<button id="more" aria-controls="menu" aria-haspopup="menu">More</button><div id="menu" role="menu" style="visibility: hidden"></div>`;
	document
		.getElementById("more")
		?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	expect(recentActivation()?.id).toBe("more");
	expect(isActivationThroughPopup()).toBe(false);
});

test("keyShortcutsOf gives the ARIA form of a hotkey, and none for a lone modifier", () => {
	expect(keyShortcutsOf("Control+Shift+S")).toBe("Control+Shift+S");
	expect(keyShortcutsOf("D")).toBe("D");
	expect(keyShortcutsOf("Alt")).toBeUndefined();
	expect(keyShortcutsOf(undefined)).toBeUndefined();
});
