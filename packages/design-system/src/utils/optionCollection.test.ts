import { describe, expect, test } from "vitest";

import {
	defaultIsItemDisabled,
	defaultItemToString,
	defaultItemToValue,
	filterItemsByInput,
} from "./optionCollection.ts";

describe("optionCollection helpers", () => {
	test("defaultItemToValue reads a string, number, or .value", () => {
		expect(defaultItemToValue("a")).toBe("a");
		expect(defaultItemToValue(3)).toBe("3");
		expect(defaultItemToValue({ value: "x" })).toBe("x");
	});

	test("defaultItemToValue throws for a shape with no value field", () => {
		expect(() => defaultItemToValue({ name: "x" })).toThrow();
	});

	test("defaultItemToString prefers .label, falls back to the value", () => {
		function toValue(i: { value: string }) {
			return i.value;
		}
		expect(defaultItemToString({ value: "v", label: "L" }, toValue)).toBe(
			"L"
		);
		expect(defaultItemToString({ value: "v" }, toValue)).toBe("v");
	});

	test("defaultIsItemDisabled reads the disabled field", () => {
		expect(defaultIsItemDisabled({ value: "a", disabled: true })).toBe(
			true
		);
		expect(defaultIsItemDisabled({ value: "a" })).toBe(false);
	});

	test("filterItemsByInput is a case-insensitive substring match on the text", () => {
		const items = [
			{ value: "react" },
			{ value: "solid" },
			{ value: "svelte" },
		];
		function toString(i: { value: string }) {
			return i.value;
		}
		expect(filterItemsByInput(items, "E", toString)).toEqual([
			{ value: "react" },
			{ value: "svelte" },
		]);
		expect(filterItemsByInput(items, "", toString)).toEqual(items);
	});
});
