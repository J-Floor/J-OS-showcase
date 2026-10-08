import { describe, expect, it } from "vitest";

import {
	errorMessage,
	lockNamesFromModel,
	matchesStrictly,
} from "./doorProvider.ts";

describe("email comparison is case-insensitive", () => {
	const identity = {
		providerUserId: "7",
		email: "Ada@Example.COM",
		name: "Ada L",
		authIds: [],
	};

	it("matchesStrictly matches the same address in another casing", () => {
		expect(matchesStrictly(identity, { email: "ada@example.com" })).toBe(
			true
		);
		expect(matchesStrictly(identity, { email: "bob@example.com" })).toBe(
			false
		);
	});
});

describe("lockNamesFromModel", () => {
	it("resolves ids to names and falls back for unknown ids", () => {
		const model = {
			identities: [],
			locks: [{ lockId: "L1", name: "Bottom" }],
		};
		expect(lockNamesFromModel(model, ["L1", "L2"])).toEqual([
			"Bottom",
			"unknown lock L2",
		]);
	});
});

describe("errorMessage", () => {
	it("reads an Error's message and stringifies anything else", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
		expect(errorMessage("plain")).toBe("plain");
		expect(errorMessage(42)).toBe("42");
	});
});
