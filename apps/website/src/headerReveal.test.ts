import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { revealHeaderOnScroll } from "./headerReveal.ts";

let position = 0;
let dispose: (() => void) | undefined;
beforeEach(() => {
	position = 0;
	vi.spyOn(window, "scrollY", "get").mockImplementation(() => position);
	window.history.replaceState(null, "", "/");
});
afterEach(() => {
	dispose?.();
	dispose = undefined;
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
it("reveals on the first scroll and stays revealed after returning to the top", () => {
	const header = document.createElement("header");
	dispose = revealHeaderOnScroll(header);
	expect(header.inert).toBe(true);
	expect(header.getAttribute("aria-hidden")).toBe("true");
	position = 1;
	window.dispatchEvent(new Event("scroll"));
	expect(header.dataset.revealed).toBe("true");
	expect(header.inert).toBe(false);
	position = 0;
	window.dispatchEvent(new Event("scroll"));
	expect(header.dataset.revealed).toBe("true");
	expect(header.hasAttribute("aria-hidden")).toBe(false);
});
it("reveals immediately when restoring a scrolled page", () => {
	position = 100;
	const header = document.createElement("header");
	dispose = revealHeaderOnScroll(header);
	expect(header.dataset.revealed).toBe("true");
});
it("keeps section links and keyboard skip navigation available", () => {
	window.history.replaceState(null, "", "/#events");
	const header = document.createElement("header");
	dispose = revealHeaderOnScroll(header);
	expect(header.inert).toBe(false);
	dispose();
	window.history.replaceState(null, "", "/");
	delete header.dataset.revealed;
	dispose = revealHeaderOnScroll(header);
	const target = document.createElement("section");
	document.body.append(target);
	target.dispatchEvent(new Event("intro-skip"));
	expect(header.inert).toBe(false);
	expect(header.dataset.revealed).toBe("true");
});
