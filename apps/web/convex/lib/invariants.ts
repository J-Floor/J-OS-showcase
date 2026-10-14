import type { Doc, Id } from "../_generated/dataModel";

import { agreementVariantFor, isLiveStage } from "./derive.ts";
import { groupByNormalizedEmail } from "./emailAddress.ts";
import { ALL_STATES, canActivate, factsFor } from "./lifecycle.ts";
import type { Facts, StateId } from "./lifecycleTypes.ts";
import { requiredSelfStepIds } from "./onboardingSteps.ts";

export type ViolationCode =
	| "illegal-state"
	| "should-be-active"
	| "onboarding-blocked"
	| "onboarding-without-steps"
	| "active-without-agreement"
	| "active-never-onboarded"
	| "live-past-window"
	| "expired-guest-open-window"
	| "verified-without-verifiedAt"
	| "unverified-with-verifiedAt"
	| "former-without-origin"
	| "duplicate-email";

export type Violation = { code: ViolationCode; detail: string };

const KNOWN_STATES: ReadonlySet<string> = new Set<string>(ALL_STATES);
const VERIFIED_STATES: ReadonlySet<string> = new Set<StateId>([
	"prospect.verified",
	"prospect.queued",
	"visitor.verified",
]);
const UNVERIFIED_STATES: ReadonlySet<string> = new Set<StateId>([
	"prospect.unverified",
	"visitor.unverified",
]);

type Subject = {
	person: Doc<"people">;
	state: string;
	facts: Facts;
	isNeedsAgreement: boolean;
	agreementDetail: string;
	now: number;
};

function stateViolations({ state }: Subject): Violation[] {
	return KNOWN_STATES.has(state)
		? []
		: [{ code: "illegal-state", detail: state }];
}

function onboardingViolations({
	person,
	state,
	facts,
	agreementDetail,
}: Subject): Violation[] {
	if (person.stage !== "onboarding") return [];
	if (requiredSelfStepIds(person.tier).length === 0)
		return [{ code: "onboarding-without-steps", detail: state }];
	if (canActivate(facts))
		return [{ code: "should-be-active", detail: state }];
	// Every step ticked, the agreement still missing: the wizard has
	// nothing left to ask, and only the board can unstick them.
	return facts.selfStepsComplete
		? [{ code: "onboarding-blocked", detail: agreementDetail }]
		: [];
}

function activeViolations({
	person,
	state,
	facts,
	isNeedsAgreement,
	agreementDetail,
}: Subject): Violation[] {
	if (person.stage !== "active" || !isNeedsAgreement) return [];
	const found: Violation[] = [];
	if (!facts.complianceMet)
		found.push({
			code: "active-without-agreement",
			detail: agreementDetail,
		});
	if (!facts.selfStepsComplete && !facts.everActive)
		found.push({ code: "active-never-onboarded", detail: state });
	return found;
}

function windowViolations({ person, state, facts, now }: Subject): Violation[] {
	const found: Violation[] = [];
	// Past the end specifically, not "outside the window": a window that has
	// not started yet is not this fault. Any tier: a member who kept a guest's
	// end date is locked out just the same.
	if (
		isLiveStage(person.stage) &&
		person.accessUntil !== undefined &&
		person.accessUntil <= now
	)
		found.push({
			code: "live-past-window",
			detail: new Date(person.accessUntil).toISOString(),
		});
	if (state === "guest.expired" && facts.windowOpen)
		found.push({ code: "expired-guest-open-window", detail: state });
	return found;
}

function verificationViolations({ person, state }: Subject): Violation[] {
	if (VERIFIED_STATES.has(state) && person.verifiedAt === undefined)
		return [{ code: "verified-without-verifiedAt", detail: state }];
	return UNVERIFIED_STATES.has(state) && person.verifiedAt !== undefined
		? [{ code: "unverified-with-verifiedAt", detail: state }]
		: [];
}

function formerViolations({ person }: Subject): Violation[] {
	if (person.tier !== "former" || (person.formerOf && person.formerReason))
		return [];
	return [
		{
			code: "former-without-origin",
			detail: `formerOf=${person.formerOf ?? "none"} formerReason=${person.formerReason ?? "none"}`,
		},
	];
}

const CHECKS: ((subject: Subject) => Violation[])[] = [
	stateViolations,
	onboardingViolations,
	activeViolations,
	windowViolations,
	verificationViolations,
	formerViolations,
];

/**
 * Every way a person's lifecycle state can disagree with their data. The
 * nightly check and the tests share this table; a new rule goes here once.
 */
export function violations(
	person: Doc<"people">,
	signatureVariants: string[],
	now: number
): Violation[] {
	const variant = agreementVariantFor(person.tier);
	const subject: Subject = {
		person,
		state: [person.tier, person.stage].join("."),
		facts: factsFor(person, signatureVariants, person.tier, now),
		isNeedsAgreement: variant !== null,
		agreementDetail: `needs ${variant ?? "none"}, has ${signatureVariants.join(",") || "none"}`,
		now,
	};
	return CHECKS.flatMap((check) => check(subject));
}

/** People sharing one email once normalized, keyed by person id. */
export function duplicateEmails(
	people: Doc<"people">[]
): Map<Id<"people">, Violation> {
	const out = new Map<Id<"people">, Violation>();
	for (const [email, group] of groupByNormalizedEmail(people))
		for (const person of group)
			out.set(person._id, { code: "duplicate-email", detail: email });
	return out;
}
