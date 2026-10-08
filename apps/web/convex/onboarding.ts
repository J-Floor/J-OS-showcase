import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { personForCurrentUser } from "./lib/currentPerson.ts";
import { entitled } from "./lib/derive.ts";
import { displayName } from "./lib/names.ts";
import { requiredSelfStepIds } from "./lib/onboardingSteps.ts";
import { selfView } from "./lib/personViews.ts";
import { ACCESS_TIERS } from "./lib/roles.ts";
import { applyEventIfLegal } from "./lifecycle.ts";

/**
 * What the wizard and the boot gate need. `needsOnboarding` is now a plain read
 * of the machine's stage — no application join, and no `needsOnboarding(state)`
 * helper that answered `false` for anyone who never had an application.
 */
export const getState = query({
	args: {},
	handler: async (ctx) => {
		const person = await personForCurrentUser(ctx);
		if (!person)
			return { person: null, hasAccess: true, needsOnboarding: false };
		const hasAccess = entitled(person, Date.now());
		return {
			person: selfView(person),
			hasAccess,
			needsOnboarding: hasAccess && person.stage === "onboarding",
		};
	},
});

/**
 * Gate at ENTRY: an expired or kicked-out person must not be admitted into the
 * onboarding flow at all, and only someone actually in the onboarding stage has
 * steps to complete.
 */
async function requireOnboardingPerson(
	ctx: MutationCtx
): Promise<Doc<"people">> {
	const person = await personForCurrentUser(ctx);
	if (!person)
		throw new Error("No onboarding in progress for the current user.");
	if (!entitled(person, Date.now()))
		throw new Error("Access expired or revoked");
	if (person.stage !== "onboarding") {
		throw new Error("Current user is not in an onboarding state.");
	}
	return person;
}

/**
 * Mark a step complete, audit it, then let the machine decide whether that was
 * the last thing in the way. Called from `completeStep` and from
 * `agreementsInternal.recordSignature`.
 *
 * Idempotent: repeating a step keeps the original timestamp and writes no
 * second audit row.
 */
export async function markStepComplete(
	ctx: MutationCtx,
	personId: Id<"people">,
	stepId: string
): Promise<void> {
	const person = await ctx.db.get(personId);
	if (!person) return;
	const prev = person.onboarding ?? { steps: {} };
	if (stepId in prev.steps) return;

	const steps = { ...prev.steps, [stepId]: { completedAt: Date.now() } };
	await ctx.db.patch(personId, { onboarding: { ...prev, steps } });
	// The person is their own actor here: the timeline shows their name.
	await ctx.db.insert("personEvents", {
		personId,
		at: Date.now(),
		actorId: personId,
		kind: "step",
		meta: stepId,
	});
	// Still blocked (another step or the agreement) is an ordinary outcome.
	await applyEventIfLegal(ctx, personId, { type: "ONBOARDING_PROGRESSED" });
}

export const completeStep = mutation({
	args: { stepId: v.string() },
	handler: async (ctx, { stepId }) => {
		const person = await requireOnboardingPerson(ctx);
		// Same list the activation guard uses. The retired door-key step is not in
		// it, so completing it is rejected like any unknown step.
		const required = requiredSelfStepIds(person.tier) as string[];
		if (!required.includes(stepId)) {
			throw new Error(`Unknown onboarding step: ${stepId}`);
		}
		// The document step is completed only by signing the agreement, so
		// onboarding cannot finish without a signature on file.
		if (stepId === "document") {
			throw new Error(
				"The document step is completed by signing the agreement."
			);
		}
		await markStepComplete(ctx, person._id, stepId);
		return null;
	},
});

/**
 * Re-run the activation edge for the caller. The wizard calls this when it
 * finds no step left: someone whose last fact (a signature, a step) was
 * written without the edge firing is otherwise stuck on an empty wizard.
 * The machine's own guard decides; a refusal is logged so the drift shows.
 */
export const resume = mutation({
	args: {},
	handler: async (ctx): Promise<{ activated: boolean }> => {
		const person = await requireOnboardingPerson(ctx);
		const next = await applyEventIfLegal(ctx, person._id, {
			type: "ONBOARDING_PROGRESSED",
		});
		if (next === null)
			// eslint-disable-next-line no-console -- drift the board must see in the Convex logs
			console.warn(
				`[onboarding.resume] ${person._id} has no step left but cannot activate`
			);
		return { activated: next !== null };
	},
});

export const setTourSeen = mutation({
	args: {},
	handler: async (ctx) => {
		const person = await requireRole(ctx, ACCESS_TIERS);
		const prev = person.onboarding ?? { steps: {} };
		await ctx.db.patch(person._id, {
			onboarding: { ...prev, tourSeen: true },
		});
		return null;
	},
});

/**
 * Mark the one-time "Getting in" intro as seen, for the signed-in caller only.
 * Idempotent: the first dismissal's time is kept.
 */
export const setDoorsIntroSeen = mutation({
	args: {},
	handler: async (ctx) => {
		const person = await requireRole(ctx, ACCESS_TIERS);
		if (person.doorsIntroSeenAt !== undefined) return null;
		await ctx.db.patch(person._id, { doorsIntroSeenAt: Date.now() });
		return null;
	},
});

/**
 * The community WhatsApp group invite link, served only to signed-in people with
 * access so it never ships in the public bundle. Null when not configured.
 */
export const whatsappInvite = query({
	args: {},
	handler: async (ctx) => {
		await requireRole(ctx, ACCESS_TIERS);
		const url = process.env.WHATSAPP_INVITE_URL;
		return url === undefined || url === "" ? null : url;
	},
});

/**
 * For the last guest onboarding step: the guest's host (a board member) as name
 * + phone, resolved from `hostedById`. Falls back to a legacy display-name
 * match for imported guests with no id. Null for members, for a guest with no
 * door access, or when the host cannot be resolved to a board member.
 */
export const getOnboardingHost = query({
	args: {},
	handler: async (ctx) => {
		const person = await personForCurrentUser(ctx);
		if (!person) return null;
		if (person.tier !== "guest") return null;
		if (!entitled(person, Date.now())) return null;

		let host = person.hostedById
			? await ctx.db.get(person.hostedById)
			: null;
		if (!host && person.hostedBy) {
			const people = await ctx.db.query("people").collect();
			host =
				people.find(
					(p) =>
						(p.tier === "board" || p.tier === "admin") &&
						displayName(p) === person.hostedBy
				) ?? null;
		}
		if (!host || (host.tier !== "board" && host.tier !== "admin"))
			return null;
		return { name: displayName(host), phone: host.phone };
	},
});
