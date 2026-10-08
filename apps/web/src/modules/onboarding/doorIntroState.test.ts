import { describe, expect, it } from "vitest";

import { doorsIntroPending, type DoorsIntroPerson } from "./doorIntroState.ts";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe("doorsIntroPending", () => {
	it("is owed to a new member, an existing member, a guest inside their window, and board/admin", () => {
		expect(
			doorsIntroPending(
				{ tier: "member", stage: "active", stageSince: NOW },
				NOW
			)
		).toBe(true);
		expect(
			doorsIntroPending(
				{ tier: "core", stage: "active", stageSince: 0 },
				NOW
			)
		).toBe(true);
		expect(
			doorsIntroPending(
				{
					tier: "guest",
					stage: "active",
					stageSince: 0,
					accessUntil: NOW + DAY,
				},
				NOW
			)
		).toBe(true);
		expect(
			doorsIntroPending(
				{ tier: "board", stage: "active", stageSince: 0 },
				NOW
			)
		).toBe(true);
		expect(
			doorsIntroPending(
				{ tier: "admin", stage: "active", stageSince: 0 },
				NOW
			)
		).toBe(true);
	});

	it("is not owed once seen", () => {
		expect(
			doorsIntroPending(
				{
					tier: "member",
					stage: "active",
					stageSince: 0,
					doorsIntroSeenAt: 1,
				},
				NOW
			)
		).toBe(false);
	});

	it("is not owed to someone the door is closed to — they cannot unlock", () => {
		expect(
			doorsIntroPending(
				{
					tier: "member",
					stage: "active",
					stageSince: 0,
					door: { override: "force_off" },
				},
				NOW
			)
		).toBe(false);
		expect(
			doorsIntroPending(
				{
					tier: "guest",
					stage: "active",
					stageSince: 0,
					accessUntil: NOW - 1,
				},
				NOW
			)
		).toBe(false);
	});

	it("is false while the person is loading or signed out", () => {
		expect(doorsIntroPending(undefined, NOW)).toBe(false);
		expect(doorsIntroPending(null, NOW)).toBe(false);
	});

	it("is false for a row with no lifecycle fields (What's New's test fixtures carry only `onboarding`)", () => {
		expect(
			doorsIntroPending(
				{ onboarding: { steps: {} } } as unknown as DoorsIntroPerson,
				NOW
			)
		).toBe(false);
	});
});
