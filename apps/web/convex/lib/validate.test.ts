import { describe, expect, it } from "vitest";

import { checkLength } from "./validate.ts";

describe("checkLength", () => {
	it("is an Err when the value is longer than max", () => {
		const result = checkLength("a".repeat(201), 200);
		expect(result.isErr() && result.error.type).toBe("FieldTooLong");
	});
	it("is Ok for undefined and values at the limit", () => {
		expect(checkLength(undefined, 1).isOk()).toBe(true);
		expect(checkLength("ab", 2).isOk()).toBe(true);
	});
});
