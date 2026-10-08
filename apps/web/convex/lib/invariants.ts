import type { Doc, Id } from "../_generated/dataModel";

import { agreementVariantFor, isLiveStage } from "./derive.ts";
import { groupByNormalizedEmail } from "./emailAddress.ts";
import { ALL_STATES, canActivate, factsFor } from "./lifecycle.ts";
import type { StateId } from "./lifecycleTypes.ts";
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

/**
 * Every way a person's lifecycle state can disagree with their data. The
 * nightly check and the tests share this table; a new rule goes here once.
 */
export function violations(
	person: Doc<"people">,
	signatureVariants: string[],
	now: number
): Violation[] {
	const out: Violation[] = [];
	const state = [person.tier, person.stage].join(".");
	const facts = factsFor(person, signatureVariants, person.tier, now);
	const variant = agreementVariantFor(person.tier);
	const needsAgreement = variant !== null;
	const agreementDetail = `needs ${variant ?? "none"}, has ${signatureVariants.join(",") || "none"}`;

	if (!KNOWN_STATES.has(state))
		out.push({ code: "illegal-state", detail: state });
	if (person.stage === "onboarding") {
		if (requiredSelfStepIds(person.tier).length === 0)
			out.push({ code: "onboarding-without-steps", detail: state });
		else if (canActivate(facts))
			out.push({ code: "should-be-active", detail: state });
		// Every step ticked, the agreement still missing: the wizard has
		// nothing left to ask, and only the board can unstick them.
		else if (facts.selfStepsComplete)
			out.push({ code: "onboarding-blocked", detail: agreementDetail });
	}
	if (person.stage === "active" && needsAgreement) {
		if (!facts.complianceMet)
			out.push({
				code: "active-without-agreement",
				detail: agreementDetail,
			});
		if (!facts.selfStepsComplete && !facts.everActive)
			out.push({ code: "active-never-onboarded", detail: state });
	}
	// Past the end specifically, not "outside the window": a window that has
	// not started yet is not this fault. Any tier: a member who kept a guest's
	// end date is locked out just the same.
	if (
		isLiveStage(person.stage) &&
		person.accessUntil != null &&
		person.accessUntil <= now
	)
		out.push({
			code: "live-past-window",
			detail: new Date(person.accessUntil).toISOString(),
		});
	if (state === "guest.expired" && facts.windowOpen)
		out.push({ code: "expired-guest-open-window", detail: state });
	if (VERIFIED_STATES.has(state) && person.verifiedAt == null)
		out.push({ code: "verified-without-verifiedAt", detail: state });
	if (UNVERIFIED_STATES.has(state) && person.verifiedAt != null)
		out.push({ code: "unverified-with-verifiedAt", detail: state });
	if (person.tier === "former" && (!person.formerOf || !person.formerReason))
		out.push({
			code: "former-without-origin",
			detail: `formerOf=${person.formerOf ?? "none"} formerReason=${person.formerReason ?? "none"}`,
		});
	return out;
}

/** People sharing one email once normalized, keyed by person id. */
export function duplicateEmails(
	people: Doc<"people">[]
): Map<Id<"people">, Violation> {
	const out = new Map<Id<"people">, Violation>();
	for (const [email, group] of groupByNormalizedEmail(people))
		for (const p of group)
			out.set(p._id, { code: "duplicate-email", detail: email });
	return out;
}
