import { beforeEach, describe, expect, it } from "vitest";

import {
	addRecent,
	readRecents,
	scoreMatch,
	writeRecents,
} from "./CommandPalette.helpers.ts";

describe("scoreMatch", () => {
	it("scores an exact match highest", () => {
		expect(scoreMatch("Button", "Button")).toBe(1);
	});

	it("scores a word-start match above a mid-word match", () => {
		expect(scoreMatch("Number input", "input")).toBeGreaterThan(
			scoreMatch("Number input", "put")
		);
	});

	it("rejects a non-substring instead of fuzzy-matching it", () => {
		expect(scoreMatch("Implementing your own app", "menu")).toBe(0);
	});

	it("ignores case", () => {
		expect(scoreMatch("Button", "BUTTON")).toBe(1);
	});

	it("matches a keyword when the value does not match", () => {
		expect(
			scoreMatch("Combobox", "dropdown", ["dropdown"])
		).toBeGreaterThan(0);
	});

	it("ranks a keyword match below any match on the value itself", () => {
		const midWordValue = scoreMatch("Number input", "put");
		const exactKeyword = scoreMatch("Combobox", "put", ["put"]);
		expect(exactKeyword).toBeLessThan(midWordValue);
	});

	it("ignores keywords that do not match", () => {
		expect(scoreMatch("Combobox", "table", ["dropdown", "select"])).toBe(0);
	});

	it("shows everything for an empty search", () => {
		expect(scoreMatch("Button", "")).toBe(1);
		expect(scoreMatch("Button", "   ")).toBe(1);
	});
});

describe("addRecent", () => {
	it("puts the newest value first", () => {
		expect(addRecent(["Dialog"], "Button", 5)).toEqual([
			"Button",
			"Dialog",
		]);
	});

	it("moves an existing value to the front instead of duplicating it", () => {
		expect(addRecent(["Dialog", "Button"], "Button", 5)).toEqual([
			"Button",
			"Dialog",
		]);
	});

	it("caps the list at max", () => {
		expect(addRecent(["b", "c", "d"], "a", 3)).toEqual(["a", "b", "c"]);
	});
});

describe("recents storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("round-trips a list", () => {
		writeRecents("k", ["Button", "Dialog"]);
		expect(readRecents("k")).toEqual(["Button", "Dialog"]);
	});

	it("reads an unset key as empty", () => {
		expect(readRecents("missing")).toEqual([]);
	});

	it("reads corrupt JSON as empty instead of throwing", () => {
		localStorage.setItem("k", "{not json");
		expect(readRecents("k")).toEqual([]);
	});

	it("reads a non-array payload as empty", () => {
		localStorage.setItem("k", JSON.stringify({ a: 1 }));
		expect(readRecents("k")).toEqual([]);
	});

	it("drops non-string entries", () => {
		localStorage.setItem("k", JSON.stringify(["Button", 3, null]));
		expect(readRecents("k")).toEqual(["Button"]);
	});
});
