import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	type MutationCtx,
} from "./_generated/server";
import {
	duplicateEmails,
	violations,
	type ViolationCode,
} from "./lib/invariants.ts";
import { displayName } from "./lib/names.ts";
import { applyEventIfLegal } from "./lifecycle.ts";
import { alertOnChange } from "./notify/alertOnChange.ts";
import { LIFECYCLE_ALERT_KEY, type AlertDecision } from "./opsAlerts.ts";

type Found = {
	personId: Id<"people">;
	name: string;
	code: ViolationCode;
	detail: string;
};

/** Sort key and alert fingerprint both: the fingerprint is stable only because
 *  the list is sorted by the same key. */
function keyOf(found: Found): string {
	return `${found.code}:${found.personId}`;
}

type SignatureRow = Doc<"signatures">;

function variantsOf(signatures: SignatureRow[], id: Id<"people">) {
	return signatures
		.filter((signature) => signature.personId === id)
		.map((signature) => signature.variant);
}

/** Activates everyone the machine can activate on its own; returns how many. */
async function healActivatable(
	context: MutationCtx,
	signatures: SignatureRow[],
	now: number
): Promise<number> {
	let healed = 0;
	const people = await context.db.query("people").collect();
	for (const person of people) {
		const codes = violations(
			person,
			variantsOf(signatures, person._id),
			now
		).map((violation) => violation.code);
		// Someone whose window already closed must not be activated by healing.
		if (
			!codes.includes("should-be-active") ||
			codes.includes("live-past-window")
		)
			continue;
		const next = await applyEventIfLegal(context, person._id, {
			type: "ONBOARDING_PROGRESSED",
		});
		if (next !== null) healed += 1;
	}
	return healed;
}

function scanViolations(
	people: Doc<"people">[],
	signatures: SignatureRow[],
	now: number
): Found[] {
	const duplicates = duplicateEmails(people);
	const found: Found[] = [];
	for (const person of people) {
		const list = violations(
			person,
			variantsOf(signatures, person._id),
			now
		);
		const duplicate = duplicates.get(person._id);
		if (duplicate) list.push(duplicate);
		for (const violation of list)
			found.push({
				personId: person._id,
				name: displayName(person),
				code: violation.code,
				detail: violation.detail,
			});
	}
	return found;
}

/**
 * Heal what the machine can heal on its own (someone who should be active),
 * then list every remaining violation. One transaction: the table is small.
 */
export const healAndScan = internalMutation({
	args: {},
	handler: async (context): Promise<{ healed: number; found: Found[] }> => {
		const now = Date.now();
		const signatures = await context.db.query("signatures").collect();
		const healed = await healActivatable(context, signatures, now);
		const people = await context.db.query("people").collect();
		const found = scanViolations(people, signatures, now);
		found.sort((first, second) =>
			keyOf(first).localeCompare(keyOf(second))
		);
		return { healed, found };
	},
});

function alertHeadline(outcome: string, count: number): string {
	if (outcome === "resolved")
		return "Every person's status is consistent again";
	return `${count} ${count === 1 ? "person has" : "people have"} an inconsistent status`;
}

/** Nightly: heal, then tell the board about what is left (deduped by opsAlerts). */
export const check = internalAction({
	args: {},
	handler: async (
		context
	): Promise<{
		healed: number;
		violations: number;
		decision: AlertDecision;
	}> => {
		const { healed, found } = await context.runMutation(
			internal.invariants.healAndScan,
			{}
		);
		const decision = await alertOnChange(context, {
			key: LIFECYCLE_ALERT_KEY,
			fingerprint: found.map((item) => keyOf(item)).join(","),
			kind: "lifecycleAlert",
			payloadFor: (outcome) => ({
				headline: alertHeadline(outcome, found.length),
				items: outcome === "resolved" ? [] : found,
				tag: LIFECYCLE_ALERT_KEY,
			}),
		});
		return { healed, violations: found.length, decision };
	},
});
