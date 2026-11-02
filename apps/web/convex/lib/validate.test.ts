import { describe, expect, it } from "vitest";

import { checkLength, optionalCappedText } from "./validate.ts";

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

describe("optionalCappedText", () => {
	it("is Ok(undefined) for undefined and blank text", () => {
		expect(
			optionalCappedText(undefined, 10)._unsafeUnwrap()
		).toBeUndefined();
		expect(optionalCappedText("  ", 10)._unsafeUnwrap()).toBeUndefined();
	});
	it("trims the text", () => {
		expect(optionalCappedText(" hi ", 10)._unsafeUnwrap()).toBe("hi");
	});
	it("is an Err past the cap", () => {
		const result = optionalCappedText("a".repeat(11), 10);
		expect(result.isErr() && result.error.type).toBe("FieldTooLong");
	});
});
