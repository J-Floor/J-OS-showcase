// @vitest-environment happy-dom
import { cleanup } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

import { modules } from "../registry.ts";

import { TOUR_STEPS, shouldStartTour } from "./WelcomeTour.tsx";

test("tour has a welcome dialog, the two tab stops, and a finish", () => {
	const ids = TOUR_STEPS.map((s) => s.id);
	expect(ids[0]).toBe("welcome");
	expect(ids).toContain("community");
	expect(ids).toContain("space");
	expect(ids.at(-1)).toBe("complete");
});

// A tooltip step whose target() resolves to null tears the whole tour down in
// ark-ui (users get stuck on "Start"). Mirror the Sidebar's `nav-${module.id}`
// markup and assert every tooltip anchor still resolves.
test("every tooltip step targets a live sidebar nav element", () => {
	document.body.innerHTML = modules
		.map((m) => `<a id="nav-${m.id}"></a>`)
		.join("");

	for (const step of TOUR_STEPS) {
		if (step.type !== "tooltip") continue;
		expect(
			step.target?.(),
			`tour step "${step.id}" target must resolve to a sidebar nav element`
		).not.toBeNull();
	}
});

test("the tour starts for a member who finished onboarding and has seen the doors intro", () => {
	expect(
		shouldStartTour(
			{
				tier: "member",
				stage: "active",
				stageSince: 0,
				doorsIntroSeenAt: 1,
				onboarding: { steps: {}, tourSeen: false },
			},
			Date.now()
		)
	).toBe(true);
});

test("the tour waits while the doors intro is pending", () => {
	expect(
		shouldStartTour(
			{
				tier: "member",
				stage: "active",
				stageSince: 0,
				onboarding: { steps: {}, tourSeen: false },
			},
			Date.now()
		)
	).toBe(false);
});

test("the tour does not wait on an intro a door-closed person never gets", () => {
	expect(
		shouldStartTour(
			{
				tier: "member",
				stage: "active",
				stageSince: 0,
				door: { override: "force_off" },
				onboarding: { steps: {}, tourSeen: false },
			},
			Date.now()
		)
	).toBe(true);
});

test("the tour never starts twice, nor for board/admin (no onboarding record), nor while loading", () => {
	const now = Date.now();
	expect(
		shouldStartTour(
			{
				tier: "member",
				stage: "active",
				stageSince: 0,
				doorsIntroSeenAt: 1,
				onboarding: { steps: {}, tourSeen: true },
			},
			now
		)
	).toBe(false);
	expect(
		shouldStartTour(
			{
				tier: "board",
				stage: "active",
				stageSince: 0,
				doorsIntroSeenAt: 1,
			},
			now
		)
	).toBe(false);
	expect(shouldStartTour(null, now)).toBe(false);
	expect(shouldStartTour(undefined, now)).toBe(false);
});
