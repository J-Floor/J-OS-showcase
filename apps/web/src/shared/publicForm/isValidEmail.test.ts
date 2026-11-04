import { expect, test } from "vitest";

import { isValidEmail } from "./isValidEmail.ts";

test.each([
	["a@example.com", true],
	["first.last@sub.example.com", true],
	["a@b..c", true],
	["a@.b.c", true],
	["a@b.c.", true],
	["", false],
	["plain", false],
	["@example.com", false],
	["a@", false],
	["a@b", false],
	["a@b.", false],
	["a@.b", false],
	["a@@example.com", false],
	["a@b@example.com", false],
	["a b@example.com", false],
	["a@example .com", false],
	["a@example.c om", false],
	["a@b.c\n", false],
	[" a@example.com", false],
])("%j is valid: %s", (value, expected) => {
	expect(isValidEmail(value)).toBe(expected);
});
