import { afterEach, expect, test, vi } from "vitest";

import { mockLayoutBoxes } from "../test/viewTransitionFakes.ts";

import { type EntityId, findMorphTarget } from "./morphPairing.ts";

const id = "abc" as EntityId;

afterEach(() => {
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

test("finds the on-screen element for an id", () => {
	mockLayoutBoxes();
	document.body.innerHTML = `<div data-morph-of="abc" id="row"></div>`;
	expect(findMorphTarget(id)?.id).toBe("row");
});

test("skips elements with no box", () => {
	document.body.innerHTML = `<div data-morph-of="abc"></div>`;
	expect(findMorphTarget(id)).toBeNull();
});

test("warns in development when two are on screen, and uses the first", () => {
	mockLayoutBoxes();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	document.body.innerHTML = `<div data-morph-of="abc" id="one"></div><div data-morph-of="abc" id="two"></div>`;
	expect(findMorphTarget(id)?.id).toBe("one");
	expect(warn).toHaveBeenCalledTimes(1);
});
