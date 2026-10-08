import { describe, expect, it } from "vitest";

import {
	groupByNormalizedEmail,
	normalizeEmail,
	validEmail,
} from "./emailAddress.ts";

describe("normalizeEmail", () => {
	it("lowercases and trims so casing variants are one address", () => {
		expect(normalizeEmail("  Foo@Example.com ")).toBe("foo@example.com");
		expect(normalizeEmail("foo@example.com")).toBe("foo@example.com");
	});
});

describe("groupByNormalizedEmail", () => {
	it("groups casing variants and leaves singletons out", () => {
		const groups = groupByNormalizedEmail([
			{ id: 1, email: "Shane@example.com" },
			{ id: 2, email: "shane@example.com " },
			{ id: 3, email: "other@example.com" },
		]);
		expect([...groups.keys()]).toEqual(["shane@example.com"]);
		expect(groups.get("shane@example.com")?.map((r) => r.id)).toEqual([
			1, 2,
		]);
	});
});

// The guard that keeps a garbage email (venture text leaked into the field) from
// being sent and, unhandled, aborting the whole batch.
describe("validEmail", () => {
	it("accepts a normal address", () => {
		expect(validEmail("a@example.com")).toBe(true);
		expect(validEmail("first.last@sub.example.com")).toBe(true);
	});

	it("rejects the corrupted-field shapes seen in prod", () => {
		expect(validEmail("undefined / pwnkit labs / dreamlabs")).toBe(false);
		expect(validEmail("")).toBe(false);
		expect(validEmail("no-at-sign")).toBe(false);
		expect(validEmail("a@b")).toBe(false);
		expect(validEmail("has space@example.com")).toBe(false);
	});
});
