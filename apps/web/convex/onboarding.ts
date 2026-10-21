import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { personForCurrentUser } from "./lib/currentPerson.ts";
import { entitled } from "./lib/derive.ts";
import type { AuthError } from "./lib/errors/auth.ts";
import type { PeopleError } from "./lib/errors/people.ts";
import { displayName } from "./lib/names.ts";
import { requiredSelfStepIds } from "./lib/onboardingSteps.ts";
import { selfView } from "./lib/personViews.ts";
import { invariant, refuse, unwrap } from "./lib/result.ts";
import { ACCESS_TIERS } from "./lib/roles.ts";
import { applyEventIfLegal } from "./lifecycle.ts";

/**
 * What the wizard and the boot gate need. `needsOnboarding` is now a plain read
 * of the machine's stage — no application join, and no `needsOnboarding(state)`
 * helper that answered `false` for anyone who never had an application.
 */
export const getState = query({
	args: {},
	handler: async (context) => {
		const person = await personForCurrentUser(context);
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
	context: MutationCtx
): Promise<Result<Doc<"people">, AuthError | PeopleError>> {
	const person = await personForCurrentUser(context);
	if (!person) return err({ type: "NoOnboardingInProgress" });
	if (!entitled(person, Date.now())) return err({ type: "AccessExpired" });
	return person.stage === "onboarding"
		? ok(person)
		: err({ type: "NotOnboarding" });
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
	context: MutationCtx,
	personId: Id<"people">,
	stepId: string
): Promise<void> {
	const person = await context.db.get(personId);
	if (!person) return;
	const prev = person.onboarding ?? { steps: {} };
	if (stepId in prev.steps) return;

	const steps = { ...prev.steps, [stepId]: { completedAt: Date.now() } };
	await context.db.patch(personId, { onboarding: { ...prev, steps } });
	// The person is their own actor here: the timeline shows their name.
	await context.db.insert("personEvents", {
		personId,
		at: Date.now(),
		actorId: personId,
		kind: "step",
		meta: stepId,
	});
	// Still blocked (another step or the agreement) is an ordinary outcome.
	await applyEventIfLegal(context, personId, {
		type: "ONBOARDING_PROGRESSED",
	});
}

export const completeStep = mutation({
	args: { stepId: v.string() },
	handler: async (context, { stepId }) => {
		const person = unwrap(await requireOnboardingPerson(context));
		// Same list the activation guard uses. The retired door-key step is not in
		// it, so completing it is rejected like any unknown step.
		const required = requiredSelfStepIds(person.tier) as string[];
		invariant(
			required.includes(stepId),
			`Unknown onboarding step: ${stepId}`
		);
		// The document step is completed only by signing the agreement, so
		// onboarding cannot finish without a signature on file.
		if (stepId === "document")
			refuse({ type: "DocumentStepNeedsSignature" });
		await markStepComplete(context, person._id, stepId);
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
	handler: async (context): Promise<{ activated: boolean }> => {
		const person = unwrap(await requireOnboardingPerson(context));
		const next = await applyEventIfLegal(context, person._id, {
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
	handler: async (context) => {
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
		const prev = person.onboarding ?? { steps: {} };
		await context.db.patch(person._id, {
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
	handler: async (context) => {
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
		if (person.doorsIntroSeenAt === undefined)
			await context.db.patch(person._id, {
				doorsIntroSeenAt: Date.now(),
			});
	},
});

/**
 * The community WhatsApp group invite link, served only to signed-in people with
 * access so it never ships in the public bundle. Null when not configured.
 */
export const whatsappInvite = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, ACCESS_TIERS));
		const url = process.env.WHATSAPP_INVITE_URL;
		return url === undefined || url === "" ? null : url;
	},
});

async function findHost(
	context: QueryCtx,
	person: Doc<"people">
): Promise<Doc<"people"> | null> {
	const host = person.hostedById
		? await context.db.get(person.hostedById)
		: null;
	if (host || !person.hostedBy) return host;
	const people = await context.db.query("people").collect();
	return (
		people.find(
			(candidate) =>
				(candidate.tier === "board" || candidate.tier === "admin") &&
				displayName(candidate) === person.hostedBy
		) ?? null
	);
}

/**
 * For the last guest onboarding step: the guest's host (a board member) as name
 * + phone, resolved from `hostedById`. Falls back to a legacy display-name
 * match for imported guests with no id. Null for members, for a guest with no
 * door access, or when the host cannot be resolved to a board member.
 */
export const getOnboardingHost = query({
	args: {},
	handler: async (context) => {
		const person = await personForCurrentUser(context);
		if (person?.tier !== "guest" || !entitled(person, Date.now()))
			return null;

		const host = await findHost(context, person);
		return !host || (host.tier !== "board" && host.tier !== "admin")
			? null
			: { name: displayName(host), phone: host.phone };
	},
});
