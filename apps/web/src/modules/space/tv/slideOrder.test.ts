import { expect, test } from "vitest";

import { resolveReorder } from "./slideOrder.ts";

test("moves the dragged id to the index of the one it was dropped on", () => {
	expect(resolveReorder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
	expect(resolveReorder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
	expect(resolveReorder(["a", "b", "c"], "b", "c")).toEqual(["a", "c", "b"]);
});

test("dropping on itself or on an unknown id leaves the order alone", () => {
	const ids = ["a", "b", "c"];
	expect(resolveReorder(ids, "b", "b")).toBe(ids);
	expect(resolveReorder(ids, "x", "a")).toBe(ids);
	expect(resolveReorder(ids, "a", "x")).toBe(ids);
});

test("does not change the list it is given", () => {
	const ids = ["a", "b", "c"];
	resolveReorder(ids, "a", "c");
	expect(ids).toEqual(["a", "b", "c"]);
});
