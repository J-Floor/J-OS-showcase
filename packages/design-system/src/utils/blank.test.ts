import { describe, expect, test } from "vitest";

import { isBlank } from "./blank.ts";

describe("isBlank", () => {
	test.each([
		["null", null],
		["undefined", undefined],
		["false", false],
		["true", true],
		["an empty string", ""],
		["a whitespace string", "  \n"],
		["an empty text node", document.createTextNode("")],
		["a whitespace text node", document.createTextNode(" ")],
	])("%s is blank", (_, node) => {
		expect(isBlank(node)).toBe(true);
	});

	test.each([
		["text", "Ada"],
		["a text node", document.createTextNode("Ada")],
		["zero", 0],
		["an element", document.createElement("span")],
	])("%s is not blank", (_, node) => {
		expect(isBlank(node)).toBe(false);
	});
});
