import { describe, expect, it } from "vitest";

import { REAPPLY_DEBOUNCE_MS } from "./constants.ts";
import { reapplyDecision, type ReapplyPerson } from "./reapply.ts";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function person(over: Partial<ReapplyPerson>): ReapplyPerson {
	return { tier: "prospect", stage: "unverified", stageSince: NOW, ...over };
}

describe("reapplyDecision", () => {
	it("inserts when nobody with that email exists", () => {
		expect(reapplyDecision(null, NOW)).toEqual({ kind: "insert" });
	});

	it("reuses an unverified prospect row (edit before confirm)", () => {
		expect(reapplyDecision(person({}), NOW)).toEqual({ kind: "reuse" });
	});

	it("blocks while the board is looking at it", () => {
		expect(reapplyDecision(person({ stage: "verified" }), NOW)).toEqual({
			kind: "blocked",
			reason: "under_review",
		});
		expect(reapplyDecision(person({ stage: "queued" }), NOW)).toEqual({
			kind: "blocked",
			reason: "under_review",
		});
	});

	it("blocks a denial inside the debounce and reports the retry date", () => {
		const deniedAt = NOW - DAY;
		expect(
			reapplyDecision(person({ stage: "denied", deniedAt }), NOW)
		).toEqual({
			kind: "blocked",
			reason: "debounce",
			until: deniedAt + REAPPLY_DEBOUNCE_MS,
		});
	});

	it("reuses the row once the debounce has passed", () => {
		const deniedAt = NOW - REAPPLY_DEBOUNCE_MS - DAY;
		expect(
			reapplyDecision(person({ stage: "denied", deniedAt }), NOW)
		).toEqual({
			kind: "reuse",
		});
	});

	it("blocks anyone with active access", () => {
		expect(
			reapplyDecision(person({ tier: "member", stage: "active" }), NOW)
		).toEqual({
			kind: "blocked",
			reason: "active",
		});
		expect(
			reapplyDecision(person({ tier: "board", stage: "active" }), NOW)
		).toEqual({
			kind: "blocked",
			reason: "active",
		});
	});

	it("blocks a member the board has suspended at the door — the door is not the application", () => {
		// `entitled`, not `access`: a force_off override closes the lock, it does
		// not re-open the application process.
		expect(
			reapplyDecision(
				person({
					tier: "member",
					stage: "active",
					door: { override: "force_off" },
				}),
				NOW
			)
		).toEqual({ kind: "blocked", reason: "active" });
	});

	it("sends an expired guest back through triage", () => {
		expect(
			reapplyDecision(person({ tier: "guest", stage: "expired" }), NOW)
		).toEqual({
			kind: "reuse",
		});
	});

	it("sends a former member back through triage", () => {
		expect(
			reapplyDecision(person({ tier: "former", stage: "active" }), NOW)
		).toEqual({
			kind: "reuse",
		});
	});

	it("reuses an event visitor so they can apply with the same email", () => {
		expect(
			reapplyDecision(
				person({ tier: "visitor", stage: "unverified" }),
				NOW
			)
		).toEqual({ kind: "reuse" });
		expect(
			reapplyDecision(person({ tier: "visitor", stage: "verified" }), NOW)
		).toEqual({ kind: "reuse" });
	});

	it("never returns reuse for a state the machine has no REAPPLY edge from", () => {
		// A guest whose window closed mid-onboarding, before the nightly sweep
		// expired them. "reuse" here would dispatch REAPPLY from
		// guest.onboarding and throw IllegalTransitionError on a public endpoint.
		expect(
			reapplyDecision(
				person({
					tier: "guest",
					stage: "onboarding",
					accessUntil: NOW - DAY,
				}),
				NOW
			)
		).toEqual({ kind: "blocked", reason: "under_review" });
	});
});
