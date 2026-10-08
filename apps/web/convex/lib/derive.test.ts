import { describe, expect, it } from "vitest";

import {
	access,
	agreementVariantFor,
	compliance,
	doorOpensFor,
	entitled,
	keepsBreakGlassKey,
	isLiveStage,
	personStatus,
	windowOpen,
	type LifecyclePerson,
} from "./derive.ts";

describe("isLiveStage", () => {
	it.each([
		["onboarding", true],
		["active", true],
		["unverified", false],
		["verified", false],
		["queued", false],
		["denied", false],
		["expired", false],
	] as const)("%s -> %s", (stage, expected) => {
		expect(isLiveStage(stage)).toBe(expected);
	});
});

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function person(over: Partial<LifecyclePerson> = {}): LifecyclePerson {
	return { tier: "member", stage: "active", stageSince: NOW, ...over };
}

/** An active member with nothing left to do, the board's WhatsApp add included. */
function settled(over: Partial<LifecyclePerson> = {}): LifecyclePerson {
	return person({
		onboarding: {
			steps: {},
			boardSteps: { whatsapp: { completedAt: NOW } },
		},
		...over,
	});
}

describe("agreementVariantFor", () => {
	it("maps core and member to the member variant", () => {
		expect(agreementVariantFor("core")).toBe("member");
		expect(agreementVariantFor("member")).toBe("member");
		expect(agreementVariantFor("guest")).toBe("guest");
		expect(agreementVariantFor("board")).toBeNull();
		expect(agreementVariantFor("prospect")).toBeNull();
	});
});

describe("compliance", () => {
	it("is outstanding with no signature at all (imported people)", () => {
		expect(compliance(person(), [])).toBe("outstanding");
	});

	it("is outstanding when the variant does not match the tier", () => {
		expect(compliance(person({ tier: "member" }), ["guest"])).toBe(
			"outstanding"
		);
	});

	it("is met when a matching variant exists", () => {
		expect(
			compliance(person({ tier: "member" }), ["guest", "member"])
		).toBe("met");
	});

	it("holds a core member to the member agreement", () => {
		expect(compliance(person({ tier: "core" }), ["member"])).toBe("met");
		expect(compliance(person({ tier: "core" }), ["guest"])).toBe(
			"outstanding"
		);
	});

	it("is met for tiers that require no agreement", () => {
		expect(compliance(person({ tier: "board" }), [])).toBe("met");
	});
});

describe("windowOpen", () => {
	it("is open when there is no window at all", () => {
		expect(windowOpen(person(), NOW)).toBe(true);
	});

	it("is closed before the window starts and after it ends", () => {
		expect(windowOpen(person({ accessFrom: NOW + DAY }), NOW)).toBe(false);
		expect(windowOpen(person({ accessUntil: NOW - 1 }), NOW)).toBe(false);
		expect(windowOpen(person({ accessUntil: NOW }), NOW)).toBe(false);
	});
});

describe("access", () => {
	it("grants an active member with no override", () => {
		expect(access(person(), NOW)).toBe("granted");
	});

	it("denies a person whose window has closed", () => {
		expect(
			access(person({ tier: "guest", accessUntil: NOW - DAY }), NOW)
		).toBe("denied");
	});

	it("denies an entitled person when the board forced the door off", () => {
		expect(access(person({ door: { override: "force_off" } }), NOW)).toBe(
			"denied"
		);
	});

	it("grants a non-entitled person when the board forced the door on", () => {
		expect(
			access(
				person({
					tier: "prospect",
					stage: "verified",
					door: { override: "force_on" },
				}),
				NOW
			)
		).toBe("granted");
	});

	it("denies former people", () => {
		expect(access(person({ tier: "former", stage: "active" }), NOW)).toBe(
			"denied"
		);
	});

	it("denies an expired guest even inside a stale window", () => {
		expect(
			access(
				person({
					tier: "guest",
					stage: "expired",
					accessUntil: NOW + DAY,
				}),
				NOW
			)
		).toBe("denied");
	});

	it("entitles during onboarding", () => {
		expect(entitled(person({ stage: "onboarding" }), NOW)).toBe(true);
	});
});

describe("personStatus", () => {
	it("flags the missing agreement", () => {
		const status = personStatus(person({ stage: "onboarding" }), [], NOW);
		expect(status.tone).toBe("error");
		expect(status.flags).toContainEqual({
			id: "agreement_missing",
			variant: "member",
		});
	});

	it("raises no flag at all for a settled member — an empty cell is the signal", () => {
		expect(personStatus(settled(), ["member"], NOW).flags).toEqual([]);
	});

	it("never flags tier or stage, which the tab and group header already carry", () => {
		// The whole point of the Flags column: a row filed under "Members" must
		// not also be labelled "Member, active". If this ever fails, the column
		// has gone back to restating its neighbours.
		const status = personStatus(person({ stage: "onboarding" }), [], NOW);
		// The agreement, and the board's own outstanding to-do. No tier, no
		// stage — those are the group header's job.
		expect(status.flags.map((f) => f.id)).toEqual([
			"agreement_missing",
			"board_task_pending",
		]);
	});

	it("carries no wording — that belongs to the UI's copy module", () => {
		// Guards the split. A `label`/`value` string creeping back in here means
		// a copy change has become a backend deploy again.
		const status = personStatus(
			person({ stage: "onboarding", door: { override: "force_off" } }),
			[],
			NOW,
			"Sara Kim"
		);
		for (const item of [...status.flags, ...status.facts]) {
			expect(item).not.toHaveProperty("label");
			expect(item).not.toHaveProperty("value");
		}
	});

	it("still reports tier, stage and door as FACTS, for the drawer", () => {
		const status = personStatus(person(), ["member"], NOW);
		expect(status.facts.map((f) => f.id)).toEqual([
			"role",
			"state",
			"since",
			"agreement",
			"door",
		]);
		expect(status.facts).toContainEqual({ id: "role", tier: "member" });
		expect(status.facts).toContainEqual({
			id: "door",
			state: "open",
			actorName: undefined,
		});
		// No end date, so no line about one. A member's access does not expire,
		// and "Access until —" on every settled row is the kind of permanently
		// empty line that teaches the reader to skip the section.
		expect(status.facts.map((f) => f.id)).not.toContain("access_until");
	});

	it("reports the end of a window only for the people who have one", () => {
		const guest = person({
			tier: "guest",
			accessUntil: NOW + 30 * DAY,
		});
		expect(personStatus(guest, ["guest"], NOW).facts).toContainEqual({
			id: "access_until",
			at: NOW + 30 * DAY,
		});
	});

	it("names the board member who suspended the door when it knows them", () => {
		const p = person({
			door: { override: "force_off", reason: "under review" },
		});
		expect(
			personStatus(p, ["member"], NOW, "Sara Kim").flags
		).toContainEqual({ id: "door_suspended", actorName: "Sara Kim" });
		// Unresolved: the flag still fires, and the UI words the fallback.
		expect(personStatus(p, ["member"], NOW).flags).toContainEqual({
			id: "door_suspended",
			actorName: undefined,
		});
	});

	it("does not flag how someone left — the tab groups them instead", () => {
		// This WAS a flag ("Left voluntarily"), added because both tabs filed
		// every `former` person under a "Kicked out" heading. That was the wrong
		// fix: a heading which states something false about a row is not
		// repaired by a badge further along the same row, because the heading is
		// read first and believed. `memberGroup`/`guestStatus` now split alumni
		// out, so the flag has nothing left to correct.
		for (const reason of ["left", "kicked"] as const) {
			const p = person({
				tier: "former",
				stage: "active",
				formerReason: reason,
			});
			expect(personStatus(p, [], NOW).flags).toEqual([]);
			// The drawer still spells it out, since no heading is beside it.
			expect(personStatus(p, [], NOW).facts).toContainEqual({
				id: "former",
				reason,
			});
		}
	});

	it("ignores a stale formerReason once the person is no longer former", () => {
		// `SET_FORMER` writes it; `RE_ADMIT` and `REAPPLY` never unwrite it. A
		// re-admitted member carrying `formerReason: "kicked"` must not be
		// badged as kicked out — the guard lives in personStatus so no caller
		// can forget it.
		const readmitted = settled({ formerReason: "kicked" });
		const status = personStatus(readmitted, ["member"], NOW);
		expect(status.flags).toEqual([]);
		expect(status.facts.map((f) => f.id)).not.toContain("former");
	});

	it("lists an open board task, with its id, for someone in onboarding — and it never blocks them", () => {
		const p = person({
			stage: "onboarding",
			onboarding: { steps: {}, boardSteps: {} },
		});
		const status = personStatus(p, ["member"], NOW);
		expect(status.boardTasks).toContainEqual({
			id: "whatsapp",
			label: "Add to WhatsApp group",
		});
		// The task IS surfaced as a flag — it is board work nobody else can see —
		// but it does not block them, which is the property under test.
		expect(status.flags).toEqual([
			{ id: "board_task_pending", step: "whatsapp" },
		]);
		expect(access(p, NOW)).toBe("granted");
	});

	it("clears the board task once the board member has completed it", () => {
		const p = person({
			stage: "onboarding",
			onboarding: {
				steps: {},
				boardSteps: { whatsapp: { completedAt: NOW } },
			},
		});
		expect(personStatus(p, ["member"], NOW).boardTasks).toEqual([]);
	});

	it("keeps the board task open after activation until it is ticked", () => {
		// A guest finishes their own steps within minutes; a task that closed on
		// activation was one the board almost never saw.
		for (const tier of ["guest", "member", "core"] as const)
			expect(personStatus(person({ tier }), [], NOW).boardTasks).toEqual([
				{ id: "whatsapp", label: "Add to WhatsApp group" },
			]);
	});

	it("shows no board task for board, admin, former or expired people", () => {
		// Board and admin have no onboarding; a former or expired person is no
		// longer someone to add to the group.
		expect(
			personStatus(person({ tier: "board" }), [], NOW).boardTasks
		).toEqual([]);
		expect(
			personStatus(person({ tier: "admin" }), [], NOW).boardTasks
		).toEqual([]);
		expect(
			personStatus(person({ tier: "former", stage: "active" }), [], NOW)
				.boardTasks
		).toEqual([]);
		expect(
			personStatus(person({ tier: "guest", stage: "expired" }), [], NOW)
				.boardTasks
		).toEqual([]);
	});

	it("has nothing outstanding for a fully compliant active member", () => {
		const p = person({
			onboarding: {
				steps: {},
				boardSteps: { whatsapp: { completedAt: NOW } },
			},
		});
		const status = personStatus(p, ["member"], NOW);
		expect(status.flags).toEqual([]);
		expect(status.boardTasks).toEqual([]);
		expect(status.tone).toBe("success");
	});

	it("counts whole days in the current state", () => {
		expect(
			personStatus(
				person({ stageSince: NOW - 23 * DAY }),
				["member"],
				NOW
			).sinceDays
		).toBe(23);
		expect(
			personStatus(person({ stageSince: NOW - 1000 }), ["member"], NOW)
				.sinceDays
		).toBe(0);
		expect(
			personStatus(person({ stageSince: NOW - DAY }), ["member"], NOW)
				.sinceDays
		).toBe(1);
		// A clock skew that puts stageSince in the future must not read as a
		// negative age.
		expect(
			personStatus(person({ stageSince: NOW + DAY }), ["member"], NOW)
				.sinceDays
		).toBe(0);
	});

	it("puts the same day count on the drawer's line as on `sinceDays`", () => {
		const status = personStatus(
			person({ stageSince: NOW - 23 * DAY }),
			["member"],
			NOW
		);
		expect(status.facts).toContainEqual({
			id: "since",
			days: status.sinceDays,
		});
	});
});

describe("keepsBreakGlassKey", () => {
	it("is true for a board member whose door access is granted", () => {
		expect(keepsBreakGlassKey(person({ tier: "board" }), NOW)).toBe(true);
	});

	it("is false for a board member the board has shut out (force_off)", () => {
		expect(
			keepsBreakGlassKey(
				person({ tier: "board", door: { override: "force_off" } }),
				NOW
			)
		).toBe(false);
	});

	it("is false for a member whose door access is granted", () => {
		expect(keepsBreakGlassKey(person({ tier: "member" }), NOW)).toBe(false);
	});

	it("is true for an admin whose door access is granted", () => {
		expect(keepsBreakGlassKey(person({ tier: "admin" }), NOW)).toBe(true);
	});
});

describe("doorOpensFor", () => {
	it.each<[string, LifecyclePerson, boolean]>([
		["an active member", person(), true],
		["an onboarding member", person({ stage: "onboarding" }), true],
		[
			"a guest inside their window",
			person({ tier: "guest", accessUntil: NOW + DAY }),
			true,
		],
		[
			"a guest whose window has closed",
			person({ tier: "guest", accessUntil: NOW - DAY }),
			false,
		],
		[
			"a guest whose window has not opened",
			person({ tier: "guest", accessFrom: NOW + DAY }),
			false,
		],
		[
			"a member the board shut out (force_off)",
			person({ door: { override: "force_off" } }),
			false,
		],
		[
			"a prospect the board let in (force_on)",
			person({
				tier: "prospect",
				stage: "verified",
				door: { override: "force_on" },
			}),
			true,
		],
		[
			"a verified prospect",
			person({ tier: "prospect", stage: "verified" }),
			false,
		],
		["a former member", person({ tier: "former", stage: "active" }), false],
	])("%s", (_label, p, expected) => {
		expect(doorOpensFor(p, NOW)).toBe(expected);
	});

	it("opens for an active member and stays shut for a force_off", () => {
		expect(doorOpensFor(person(), NOW)).toBe(true);
		expect(
			doorOpensFor(person({ door: { override: "force_off" } }), NOW)
		).toBe(false);
	});
});

describe("staff", () => {
	const staff = person({ tier: "staff", stage: "active" });

	it("needs no agreement", () => {
		expect(agreementVariantFor("staff")).toBeNull();
		expect(compliance(staff, [])).toBe("met");
	});

	it("is entitled to the door while active", () => {
		expect(entitled(staff, NOW)).toBe(true);
	});

	it("never keeps a break-glass key", () => {
		expect(keepsBreakGlassKey(staff, NOW)).toBe(false);
	});

	it("carries no board tasks", () => {
		expect(personStatus(staff, [], NOW).boardTasks).toEqual([]);
	});
});
