import { afterEach, describe, expect, it, vi } from "vitest";

import { boardSignatories } from "./boardSignatories.ts";

const NOT_CONFIGURED = /BOARD_SIGNATORIES is not configured/;

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("boardSignatories", () => {
	it("parses the env var and keeps order and fields", () => {
		vi.stubEnv(
			"BOARD_SIGNATORIES",
			JSON.stringify([
				{
					name: "Hopper, Grace",
					role: "President of the board",
					signatureSlug: "hopper-grace",
				},
				{ name: "Turing, Alan", role: "Vice-president of the board" },
			])
		);
		expect(boardSignatories()).toEqual([
			{
				name: "Hopper, Grace",
				role: "President of the board",
				signatureSlug: "hopper-grace",
			},
			{ name: "Turing, Alan", role: "Vice-president of the board" },
		]);
	});

	it("throws when unset", () => {
		vi.stubEnv("BOARD_SIGNATORIES", "");
		expect(() => boardSignatories()).toThrow(NOT_CONFIGURED);
	});

	it.each([
		["not JSON", "{nope"],
		["not an array", '{"name":"Grace","role":"President"}'],
		["empty array", "[]"],
		["empty name", '[{"name":"","role":"President"}]'],
		["missing role", '[{"name":"Hopper, Grace"}]'],
		[
			"non-string slug",
			'[{"name":"Hopper, Grace","role":"P","signatureSlug":1}]',
		],
		["non-object entry", '["Hopper, Grace"]'],
	])("throws on %s", (_label, value) => {
		vi.stubEnv("BOARD_SIGNATORIES", value);
		expect(() => boardSignatories()).toThrow(NOT_CONFIGURED);
	});
});
