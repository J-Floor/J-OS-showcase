import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../_generated/dataModel";

import { agreementVariantFor } from "./derive.ts";
import {
	duplicateEmails,
	violations,
	type ViolationCode,
} from "./invariants.ts";
import {
	ALL_EVENTS,
	ALL_STATES,
	isMembershipActive,
	reduce,
	TABLE,
} from "./lifecycle.ts";
import type {
	Effect,
	Facts,
	LifecycleEvent,
	Stage,
	StateId,
	Tier,
} from "./lifecycleTypes.ts";
import { ACCESS_TIERS, formerOfTier, ROLE_TIERS } from "./roles.ts";

const NOW = 1_000_000;
const STEPS = {
	welcome: { completedAt: 1 },
	document: { completedAt: 1 },
	rules: { completedAt: 1 },
	visit: { completedAt: 1 },
};

function person(over: Partial<Doc<"people">>): Doc<"people"> {
	return {
		_id: "p1" as Id<"people">,
		_creationTime: 0,
		email: "a@example.com",
		firstName: "A",
		lastName: "B",
		tier: "member",
		stage: "active",
		stageSince: 0,
		...over,
	};
}
function codes(fixture: Doc<"people">, sigs: string[] = []) {
	return violations(fixture, sigs, NOW).map((violation) => violation.code);
}

describe("violations", () => {
	it("is empty for a healthy active member", () => {
		expect(
			codes(person({ onboarding: { steps: STEPS } }), ["member"])
		).toEqual([]);
	});
	it("is empty for a legacy member with activatedAt but no steps", () => {
		expect(codes(person({ activatedAt: 1 }), ["member"])).toEqual([]);
	});
	it("flags an illegal state", () => {
		expect(codes(person({ tier: "board", stage: "onboarding" }))).toContain(
			"illegal-state"
		);
	});
	it("flags onboarding that should be active", () => {
		expect(
			codes(
				person({
					tier: "guest",
					stage: "onboarding",
					onboarding: { steps: STEPS },
				}),
				["guest"]
			)
		).toEqual(["should-be-active"]);
	});
	it("flags onboarding with every step done and the agreement missing", () => {
		expect(
			codes(
				person({
					tier: "member",
					stage: "onboarding",
					onboarding: { steps: STEPS },
				}),
				["guest"]
			)
		).toEqual(["onboarding-blocked"]);
	});
	it("does not flag onboarding that still has a step to do", () => {
		const rest = Object.fromEntries(
			Object.entries(STEPS).filter(([id]) => id !== "document")
		);
		expect(
			codes(
				person({
					tier: "member",
					stage: "onboarding",
					onboarding: { steps: rest },
				}),
				["guest"]
			)
		).toEqual([]);
	});
	it("flags onboarding for a tier with no steps", () => {
		expect(
			codes(person({ tier: "former", stage: "onboarding" }))
		).toContain("onboarding-without-steps");
	});
	it("flags active without the right agreement", () => {
		expect(
			codes(person({ tier: "guest", activatedAt: 1 }), ["member"])
		).toEqual(["active-without-agreement"]);
	});
	it("flags active with neither steps nor activatedAt", () => {
		expect(codes(person({}), ["member"])).toEqual([
			"active-never-onboarded",
		]);
	});
	it("flags a live guest past the window", () => {
		expect(
			codes(
				person({ tier: "guest", activatedAt: 1, accessUntil: NOW - 1 }),
				["guest"]
			)
		).toEqual(["live-past-window"]);
	});
	it("flags a live member past a window they kept", () => {
		expect(
			codes(
				person({
					stage: "onboarding",
					onboarding: { steps: STEPS },
					accessUntil: NOW - 1,
				}),
				["member"]
			)
		).toEqual(["should-be-active", "live-past-window"]);
	});
	it("does not flag a member whose window has not started", () => {
		expect(
			codes(person({ activatedAt: 1, accessFrom: NOW + 1 }), ["member"])
		).toEqual([]);
	});
	it("flags an expired guest whose window is open", () => {
		expect(codes(person({ tier: "guest", stage: "expired" }))).toEqual([
			"expired-guest-open-window",
		]);
	});
	it("flags verification mismatches", () => {
		expect(codes(person({ tier: "prospect", stage: "queued" }))).toEqual([
			"verified-without-verifiedAt",
		]);
		expect(
			codes(
				person({ tier: "prospect", stage: "unverified", verifiedAt: 1 })
			)
		).toEqual(["unverified-with-verifiedAt"]);
	});
	it("flags a former without origin", () => {
		expect(codes(person({ tier: "former", formerReason: "left" }))).toEqual(
			["former-without-origin"]
		);
	});
});

describe("duplicateEmails", () => {
	it("flags both rows of a case-only duplicate", () => {
		const upperCase = person({
			_id: "a" as Id<"people">,
			email: "Shane@example.com",
		});
		const lowerCase = person({
			_id: "b" as Id<"people">,
			email: "shane@example.com",
		});
		const other = person({
			_id: "c" as Id<"people">,
			email: "other@example.com",
		});
		const found = duplicateEmails([upperCase, lowerCase, other]);
		expect(
			[...found.keys()].sort((first, second) =>
				first.localeCompare(second)
			)
		).toEqual(["a", "b"]);
		expect(found.get("a" as Id<"people">)?.code).toBe("duplicate-email");
	});
});

/**
 * The codes a landing must not produce: the activation guard's own family, and
 * a former row that forgot the tier it left. Window and verification codes are
 * left out: the synthesized row carries no window or verification fields, so
 * they would only test the fixture.
 */
const LANDING_CODES: ReadonlySet<ViolationCode> = new Set<ViolationCode>([
	"should-be-active",
	"onboarding-blocked",
	"active-without-agreement",
	"active-never-onboarded",
	"former-without-origin",
]);

const BOOLS = [true, false];

/**
 * The row `applyEvent` would write, built from the facts the guard saw:
 * steps from `selfStepsComplete` minus any step an effect re-opens, the
 * target tier's agreement from `complianceMet`, `activatedAt` from
 * `everActive` or the stamp a membership-active landing gets, and for a
 * former row the tier `SET_FORMER` records (the one left, `fromTier`) or,
 * with no such effect, the `formerOf` the facts carry.
 */
function landed(
	next: StateId,
	facts: Facts,
	effects: Effect[],
	fromTier?: Tier
): { row: Doc<"people">; sigs: string[] } {
	const [tier, stage] = next.split(".") as [Tier, Stage];
	const reset = new Set<string>(
		effects.flatMap((effect) =>
			effect.type === "RESET_STEP" ? [effect.step] : []
		)
	);
	const steps = facts.selfStepsComplete
		? Object.fromEntries(
				Object.entries(STEPS).filter(([id]) => !reset.has(id))
			)
		: {};
	const variant = agreementVariantFor(tier);
	const leaving = effects.find(
		(effect): effect is Extract<Effect, { type: "SET_FORMER" }> =>
			effect.type === "SET_FORMER"
	);
	const former =
		tier === "former"
			? {
					formerOf: leaving
						? fromTier && formerOfTier(fromTier)
						: facts.formerOf,
					formerReason: leaving?.reason ?? "kicked",
				}
			: {};
	return {
		row: person({
			tier,
			stage,
			onboarding: { steps },
			activatedAt:
				facts.everActive || isMembershipActive(next) ? 1 : undefined,
			...former,
		}),
		sigs: facts.complianceMet && variant ? [variant] : [],
	};
}

const ALL_FACTS: Facts[] = BOOLS.flatMap((isComplianceMet) =>
	BOOLS.flatMap((isSelfStepsComplete) =>
		BOOLS.flatMap((isEverActive) =>
			BOOLS.flatMap((isWindowOpen) =>
				ACCESS_TIERS.map(
					(formerOf): Facts => ({
						verified: true,
						complianceMet: isComplianceMet,
						selfStepsComplete: isSelfStepsComplete,
						everActive: isEverActive,
						windowOpen: isWindowOpen,
						formerOf,
					})
				)
			)
		)
	)
);

function landingCodesOf(row: Doc<"people">, sigs: string[]): ViolationCode[] {
	return violations(row, sigs, NOW)
		.map((violation) => violation.code)
		.filter((code) => LANDING_CODES.has(code));
}

// `loadFacts` reads compliance and steps against the target only for
// SET_ROLE, RE_ADMIT and the two approvals; elsewhere the facts describe
// the target only when both tiers share an agreement variant. What that
// leaves out is PROMOTE_TO_MEMBER (guest facts, but it re-opens the
// document step unconditionally) and REAPPLY (lands in a prospect state,
// which has no activation guard to violate). KICK_OUT and MARK_LEFT land
// in `former`, which has no activation guard either; what they must get
// right is the origin, whatever the facts.
function isDescribingTarget(
	event: LifecycleEvent,
	fromTier: Tier,
	toTier: Tier
): boolean {
	return (
		event.type === "KICK_OUT" ||
		event.type === "MARK_LEFT" ||
		event.type === "SET_ROLE" ||
		event.type === "RE_ADMIT" ||
		event.type === "APPROVE_GUEST" ||
		event.type === "APPROVE_MEMBER" ||
		agreementVariantFor(fromTier) === agreementVariantFor(toTier)
	);
}

function expectCleanLanding(
	from: StateId,
	event: LifecycleEvent,
	facts: Facts
): void {
	const rule = TABLE[from]?.[event.type];
	if (!rule) return;
	// A source row that is itself in violation proves nothing about the move.
	const source = landed(from, facts, []);
	if (landingCodesOf(source.row, source.sigs).length > 0) return;
	if (rule.guard && !rule.guard(facts, event)) return;
	const { next, effects } = reduce(from, event, facts);
	if (next === from) return;
	const fromTier = from.split(".")[0] as Tier;
	const toTier = next.split(".")[0] as Tier;
	if (!isDescribingTarget(event, fromTier, toTier)) return;
	const target = landed(next, facts, effects, fromTier);
	expect({
		from,
		event: event.type,
		facts,
		next,
		codes: landingCodesOf(target.row, target.sigs),
	}).toEqual({
		from,
		event: event.type,
		facts,
		next,
		codes: [],
	});
}

describe("the machine never lands a person in a violated state", () => {
	// IMPORT is excluded on purpose: it is the one rule that lands in active
	// without the steps (a legacy import never did them), and its `hasSignature`
	// is the importer's word, not a fact the guard reads.
	const EVENT_SAMPLES: LifecycleEvent[] = ALL_EVENTS.flatMap(
		(type): LifecycleEvent[] => {
			switch (type) {
				case "APPROVE_GUEST":
					return [{ type, until: NOW * 2 }];
				case "EXTEND_WINDOW":
					return [{ type, until: NOW * 2 }];
				case "SET_ROLE":
					return ROLE_TIERS.map((tier) => ({ type, tier }));
				case "IMPORT":
					return [];
				default:
					return [{ type }];
			}
		}
	);

	it("leaves no activation-guard violation on any landing whose facts describe the target", () => {
		for (const from of ALL_STATES)
			for (const event of EVENT_SAMPLES)
				for (const facts of ALL_FACTS)
					expectCleanLanding(from, event, facts);
	});
});
