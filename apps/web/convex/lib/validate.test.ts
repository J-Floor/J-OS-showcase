import { describe, expect, it } from "vitest";

import { assertLength } from "./validate.ts";

describe("assertLength", () => {
	it("throws when the value is longer than max", () => {
		expect(() => {
			assertLength("a".repeat(201), 200, "Name");
		}).toThrow("Name is too long (max 200 characters).");
	});
	it("accepts undefined and values at the limit", () => {
		expect(() => {
			assertLength(undefined, 1, "x");
		}).not.toThrow();
		expect(() => {
			assertLength("ab", 2, "x");
		}).not.toThrow();
	});
});
