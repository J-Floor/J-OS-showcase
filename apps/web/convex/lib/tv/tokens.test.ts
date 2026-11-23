import { describe, expect, it } from "vitest";

import { bearerToken, hashTvSecret, newTvSecret } from "./tokens.ts";

describe("newTvSecret", () => {
	it("is 64 hex chars and unique", () => {
		const first = newTvSecret();
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(newTvSecret()).not.toBe(first);
	});
});

describe("hashTvSecret", () => {
	it("is deterministic SHA-256 hex and differs from the input", async () => {
		const hash = await hashTvSecret("abc");
		expect(hash).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
});

describe("bearerToken", () => {
	function make(value?: string): Request {
		return new Request("https://example.com/tv/manifest", {
			headers: value === undefined ? {} : { Authorization: value },
		});
	}
	it("reads a Bearer token", () => {
		expect(bearerToken(make("Bearer abc123"))).toBe("abc123");
	});
	it.each([undefined, "", "Bearer", "Bearer ", "Basic abc", "bearer abc x"])(
		"rejects %s",
		(value) => {
			expect(bearerToken(make(value))).toBeNull();
		}
	);
});
