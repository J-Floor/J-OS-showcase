import { describe, expect, it } from "vitest";

import { assertLen } from "./validate.ts";

describe("assertLen", () => {
	it("throws when the value is longer than max", () => {
		expect(() => {
			assertLen("a".repeat(201), 200, "Name");
		}).toThrow("Name is too long (max 200 characters).");
	});
	it("accepts undefined and values at the limit", () => {
		expect(() => {
			assertLen(undefined, 1, "x");
		}).not.toThrow();
		expect(() => {
			assertLen("ab", 2, "x");
		}).not.toThrow();
	});
});
