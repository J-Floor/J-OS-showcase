// apps/web/convex/lib/reapply.ts
import { REAPPLY_DEBOUNCE_MS } from "./constants.ts";
import { entitled, type LifecyclePerson } from "./derive.ts";
import { legalEvents, stateOf } from "./lifecycle.ts";

export type ReapplyPerson = LifecyclePerson & { deniedAt?: number };

export type ReapplyDecision =
	| { kind: "insert" }
	| { kind: "reuse" }
	| {
			kind: "blocked";
			reason: "active" | "under_review" | "debounce";
			until?: number;
	  };

/**
 * What a fresh public submission for an email should do. One row per email, so
 * this is always a decision about an existing person:
 *   1. currently entitled to the space   -> blocked("active")
 *   2. verified or queued prospect       -> blocked("under_review")
 *   3. denied inside the debounce        -> blocked("debounce", until)
 *   4. a state the machine has a REAPPLY edge from -> reuse the row
 *   5. anything else                     -> blocked("under_review")
 *
 * Step 1 tests `entitled`, not `access`: a board door override closes the lock,
 * it does not re-open the application process.
 *
 * Step 4 asks `TABLE` rather than listing states here, so this can never hand
 * `applyEvent` an event the machine will reject. Step 5 is the honest fallback
 * for the states in between (e.g. a guest whose window closed mid-onboarding,
 * before the nightly sweep expired them): "we are already dealing with you".
 */
export function reapplyDecision(
	person: ReapplyPerson | null,
	now: number
): ReapplyDecision {
	if (person === null) return { kind: "insert" };

	if (entitled(person, now)) return { kind: "blocked", reason: "active" };

	if (
		person.tier === "prospect" &&
		(person.stage === "verified" || person.stage === "queued")
	) {
		return { kind: "blocked", reason: "under_review" };
	}

	if (person.stage === "denied" && person.deniedAt != null) {
		const until = person.deniedAt + REAPPLY_DEBOUNCE_MS;
		if (now < until) return { kind: "blocked", reason: "debounce", until };
	}

	if (!legalEvents(stateOf(person)).includes("REAPPLY")) {
		return { kind: "blocked", reason: "under_review" };
	}
	return { kind: "reuse" };
}
