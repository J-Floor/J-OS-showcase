import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
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
function keyOf(f: Found): string {
	return `${f.code}:${f.personId}`;
}

/**
 * Heal what the machine can heal on its own (someone who should be active),
 * then list every remaining violation. One transaction: the table is small.
 */
export const healAndScan = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ healed: number; found: Found[] }> => {
		const now = Date.now();
		const sigs = await ctx.db.query("signatures").collect();
		function variantsOf(id: Id<"people">) {
			return sigs.filter((s) => s.personId === id).map((s) => s.variant);
		}

		let healed = 0;
		for (const p of await ctx.db.query("people").collect()) {
			const codes = violations(p, variantsOf(p._id), now).map(
				(x) => x.code
			);
			// Someone whose window already closed must not be activated by healing.
			if (
				!codes.includes("should-be-active") ||
				codes.includes("live-past-window")
			)
				continue;
			const next = await applyEventIfLegal(ctx, p._id, {
				type: "ONBOARDING_PROGRESSED",
			});
			if (next !== null) healed += 1;
		}

		const people = await ctx.db.query("people").collect();
		const dups = duplicateEmails(people);
		const found: Found[] = [];
		for (const p of people) {
			const list = violations(p, variantsOf(p._id), now);
			const dup = dups.get(p._id);
			if (dup) list.push(dup);
			for (const x of list)
				found.push({
					personId: p._id,
					name: displayName(p),
					code: x.code,
					detail: x.detail,
				});
		}
		found.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
		return { healed, found };
	},
});

/** Nightly: heal, then tell the board about what is left (deduped by opsAlerts). */
export const check = internalAction({
	args: {},
	handler: async (
		ctx
	): Promise<{
		healed: number;
		violations: number;
		decision: AlertDecision;
	}> => {
		const { healed, found } = await ctx.runMutation(
			internal.invariants.healAndScan,
			{}
		);
		const decision = await alertOnChange(ctx, {
			key: LIFECYCLE_ALERT_KEY,
			fingerprint: found.map(keyOf).join(","),
			kind: "lifecycleAlert",
			payloadFor: (outcome) => ({
				headline:
					outcome === "resolved"
						? "Every person's status is consistent again"
						: `${found.length} ${found.length === 1 ? "person has" : "people have"} an inconsistent status`,
				items: outcome === "resolved" ? [] : found,
				tag: LIFECYCLE_ALERT_KEY,
			}),
		});
		return { healed, violations: found.length, decision };
	},
});
