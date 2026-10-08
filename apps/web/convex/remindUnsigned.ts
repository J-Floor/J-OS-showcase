// One-off: nudge onboarding members/guests who have not signed their agreement.
//
//   bunx convex run remindUnsigned:preview --prod   # who would be emailed — READ it
//   bunx convex run remindUnsigned:run --prod        # actually sends
//
// There is no separate "reminder" template — the reminder IS the approval email
// (`sendApprovalEmail`), which welcomes them and links to the sign-in where the
// agreement is signed in-app. This just re-sends it to everyone currently in
// onboarding whose required agreement is still outstanding (the same people the
// console shows as "agreement not signed").
//
// `run` sends real email; always read `preview` first. `dryRun: true` on `run`
// reports the same set without sending.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { agreementVariantFor, compliance } from "./lib/derive.ts";
import { validEmail } from "./lib/emailAddress.ts";

/** The only tiers that require an agreement (see `agreementVariantFor`), so the
 *  preview queries these by the `by_tier` index instead of scanning every row. */
const AGREEMENT_TIERS = ["guest", "member", "core"] as const;

/** Onboarding people whose required agreement is not yet signed. Read-only, so
 *  safe to run as a preview. Skips anyone whose tier needs no agreement, anyone
 *  past onboarding (signing is what moves them on), and anyone already compliant. */
export const preview = internalQuery({
	args: {},
	handler: async (ctx) => {
		const rows: {
			email: string;
			name: string;
			variant: "guest" | "member";
		}[] = [];
		for (const tier of AGREEMENT_TIERS) {
			const people = await ctx.db
				.query("people")
				.withIndex("by_tier", (q) => q.eq("tier", tier))
				.collect();
			for (const person of people) {
				const variant = agreementVariantFor(person.tier);
				if (variant === null) continue;
				if (person.stage !== "onboarding") continue;
				const sigs = await ctx.db
					.query("signatures")
					.withIndex("by_person", (q) => q.eq("personId", person._id))
					.collect();
				if (
					compliance(
						person,
						sigs.map((s) => s.variant)
					) === "met"
				)
					continue;
				rows.push({
					email: person.email,
					name: `${person.firstName} ${person.lastName}`.trim(),
					variant,
				});
			}
		}
		return { total: rows.length, rows };
	},
});

export const run = internalAction({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (
		ctx,
		{ dryRun }
	): Promise<{
		sent: number;
		failed: { email: string; error: string }[];
		invalid: string[];
		dryRun: boolean;
	}> => {
		const { rows } = await ctx.runQuery(
			internal.remindUnsigned.preview,
			{}
		);
		// One pass: partition into valid addresses and the garbage ones (a venture
		// name leaked into the email field, say).
		const valid: typeof rows = [];
		const invalid: string[] = [];
		for (const row of rows) {
			if (validEmail(row.email)) valid.push(row);
			else invalid.push(row.email);
		}

		if (dryRun === true)
			return { sent: valid.length, failed: [], invalid, dryRun: true };

		// Each send is isolated in try/catch: a bad address or a provider error is
		// recorded in `failed` and the loop continues, so one failure cannot abort
		// the batch. NOT idempotent across runs — there is no record of prior
		// sends, so re-running re-sends to every currently-valid recipient.
		let sent = 0;
		const failed: { email: string; error: string }[] = [];
		for (const row of valid) {
			try {
				// Re-sends the member/guest welcome email (with the sign-in link)
				// — `sendApprovalEmail` picks the right variant from the live row.
				await ctx.runAction(internal.notifications.sendApprovalEmail, {
					email: row.email,
				});
				sent++;
			} catch (error) {
				failed.push({
					email: row.email,
					error:
						error instanceof Error ? error.message : String(error),
				});
			}
		}
		return { sent, failed, invalid, dryRun: false };
	},
});
