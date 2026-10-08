import { describe, expect, it } from "vitest";

import {
	ACCESS_TIERS,
	BOARD_LEVEL,
	COMMUNITY_TIERS,
	isAccessTier,
	isBoardLevel,
	isCommunityTier,
} from "./roles.ts";

describe("tier membership", () => {
	it("isAccessTier: every sign-in tier, nothing else", () => {
		for (const t of ACCESS_TIERS) expect(isAccessTier(t)).toBe(true);
		for (const t of ["prospect", "former", "visitor", "none", undefined])
			expect(isAccessTier(t)).toBe(false);
	});

	it("isCommunityTier: sign-in tiers except staff", () => {
		for (const t of COMMUNITY_TIERS) expect(isCommunityTier(t)).toBe(true);
		for (const t of ["staff", "prospect", "former", "none", undefined])
			expect(isCommunityTier(t)).toBe(false);
	});
});

describe("isBoardLevel", () => {
	it("treats admin exactly like board", () => {
		expect(isBoardLevel("board")).toBe(true);
		expect(isBoardLevel("admin")).toBe(true);
	});

	it("is false for every other tier and for a row with none", () => {
		for (const tier of [
			"prospect",
			"guest",
			"member",
			"core",
			"former",
		] as const) {
			expect(isBoardLevel(tier)).toBe(false);
		}
		expect(isBoardLevel(undefined)).toBe(false);
	});

	it("agrees with BOARD_LEVEL", () => {
		expect([...BOARD_LEVEL].every((t) => isBoardLevel(t))).toBe(true);
	});

	it("ACCESS_TIERS is exactly the sign-in tiers — not a superset check an empty array would pass", () => {
		expect(new Set(ACCESS_TIERS)).toEqual(
			new Set(["guest", "member", "core", "board", "admin", "staff"])
		);
	});

	it("COMMUNITY_TIERS is every sign-in tier but staff", () => {
		expect(new Set(COMMUNITY_TIERS)).toEqual(
			new Set(["guest", "member", "core", "board", "admin"])
		);
	});
});
