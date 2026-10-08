import { describe, expect, it } from "vitest";

import {
	BOARD_STEPS,
	firstIncompleteSelfStepId,
	requiredSelfStepIds,
	SELF_STEP_IDS,
} from "./onboardingSteps.ts";

describe("requiredSelfStepIds", () => {
	it("gives every access tier the same self-serve steps", () => {
		expect(requiredSelfStepIds("guest")).toEqual([...SELF_STEP_IDS]);
		expect(requiredSelfStepIds("member")).toEqual([...SELF_STEP_IDS]);
		expect(requiredSelfStepIds("core")).toEqual([...SELF_STEP_IDS]);
	});

	it("gives prospects, former people and staff no self-serve steps", () => {
		expect(requiredSelfStepIds("prospect")).toEqual([]);
		expect(requiredSelfStepIds("former")).toEqual([]);
		expect(requiredSelfStepIds("board")).toEqual([]);
		expect(requiredSelfStepIds("admin")).toEqual([]);
	});

	it("excludes whatsapp, which is a board task and must never gate activation", () => {
		expect(requiredSelfStepIds("member")).not.toContain("whatsapp");
		expect(BOARD_STEPS.map((s) => s.id)).toContain("whatsapp");
	});
});

describe("firstIncompleteSelfStepId", () => {
	it("walks the steps in order", () => {
		expect(firstIncompleteSelfStepId("member", {})).toBe("welcome");
		expect(firstIncompleteSelfStepId("member", { welcome: {} })).toBe(
			"document"
		);
	});

	it("returns null when every self step is done", () => {
		const steps = Object.fromEntries(SELF_STEP_IDS.map((id) => [id, {}]));
		expect(firstIncompleteSelfStepId("member", steps)).toBeNull();
	});

	it("returns null for a tier with no onboarding", () => {
		expect(firstIncompleteSelfStepId("board", {})).toBeNull();
	});
});

describe("the retired door-key step", () => {
	it("is not a self step any more — the app opens the door, nobody sets up a key", () => {
		expect(SELF_STEP_IDS).toEqual([
			"welcome",
			"document",
			"rules",
			"visit",
		]);
		expect(requiredSelfStepIds("guest")).not.toContain("doorKey");
	});

	it("a legacy door-key step record neither blocks nor counts toward the next step", () => {
		const done = { welcome: {}, document: {}, rules: {}, doorKey: {} };
		expect(firstIncompleteSelfStepId("guest", done)).toBe("visit");
		expect(
			firstIncompleteSelfStepId("guest", { ...done, visit: {} })
		).toBeNull();
	});
});
