import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { DAY_MS, NINETY_DAYS } from "./lib/constants.ts";
import { developmentAdminEmail } from "./lib/devAdmin.ts";
import { normalizeEmail, personByEmail } from "./lib/emailAddress.ts";
import type { Tier } from "./lib/lifecycleTypes.ts";
import { SELF_STEP_IDS } from "./lib/onboardingSteps.ts";
import { syncSignedVariants } from "./lib/signatures.ts";

/**
 * Dev-only impersonation. Log in ONCE with the address in `DEV_ADMIN_EMAIL`
 * (the magic link is logged to the Convex logs in dev), then flip that one
 * account into any state from the CLI and refresh the browser — one function
 * per state, no args:
 *
 *   bunx convex run dev:member            # confirmed member, full access
 *   bunx convex run dev:memberOnboarding  # approved -> the wizard runs
 *   bunx convex run dev:board
 *
 * Pass `'{"email":"other@example.com"}'` to impersonate a different account.
 * These are `internalMutation`s (CLI / dashboard only, never the client).
 * NEVER run in prod.
 */

type Preset = {
	tier: Exclude<Tier, "former" | "visitor">;
	stage: "onboarding" | "active" | "verified" | "denied";
	onboarding: "clear" | "full-seen" | "full-unseen";
	access: boolean;
};

function fullSteps(now: number) {
	return Object.fromEntries(
		SELF_STEP_IDS.map((id) => [id, { completedAt: now }])
	);
}

function onboardingFor(preset: Preset, now: number) {
	return preset.onboarding === "clear"
		? undefined
		: {
				steps: fullSteps(now),
				tourSeen: preset.onboarding === "full-seen",
			};
}

function accessWindowFor(preset: Preset, now: number) {
	return preset.access
		? { accessFrom: now - DAY_MS, accessUntil: now + NINETY_DAYS }
		: { accessFrom: undefined, accessUntil: undefined };
}

/** Drive `email`'s person to the given target state. */
async function apply(
	context: MutationCtx,
	preset: Preset,
	email: string | undefined
) {
	const addr = normalizeEmail(email ?? developmentAdminEmail());
	const now = Date.now();

	const existing = await personByEmail(context, addr);
	// Display-only name pair for the impersonation account; preserved if the row
	// already exists, else a generic default.
	const firstName = existing?.firstName ?? "J Floor";
	const lastName = existing?.lastName ?? "Dev";

	// Re-onboarding presets clear progress; also wipe any prior signature so the
	// document step can be re-signed (signAgreement rejects a second signing).
	if (existing && preset.onboarding === "clear") {
		const sigs = await context.db
			.query("signatures")
			.withIndex("by_person", (range) =>
				range.eq("personId", existing._id)
			)
			.collect();
		for (const sig of sigs) await context.db.delete(sig._id);
		await syncSignedVariants(context, existing);
	}

	const fields = {
		tier: preset.tier,
		stage: preset.stage,
		stageSince: now,
		provenance: "seed" as const,
		door: { override: "none" as const },
		onboarding: onboardingFor(preset, now),
		...accessWindowFor(preset, now),
	};

	if (existing) {
		await context.db.patch(existing._id, fields);
		return { person: existing._id };
	}
	const id = await context.db.insert("people", {
		email: addr,
		firstName,
		lastName,
		...fields,
	});
	return { person: id };
}

const emailArgument = { email: v.optional(v.string()) };

/** Define a zero-arg (optional email) dev mutation for one target state. */
function presetMutation(preset: Preset) {
	return internalMutation({
		args: emailArgument,
		handler: (context, { email }) => apply(context, preset, email),
	});
}

// Settled, full access (onboarding done, tour already seen).
export const board = presetMutation({
	tier: "board",
	stage: "active",
	onboarding: "clear",
	access: false,
});
// Same rights as board, different label — for people who are not on the board.
export const admin = presetMutation({
	tier: "admin",
	stage: "active",
	onboarding: "clear",
	access: false,
});
// Door and board contacts only: no agreement, no onboarding.
export const staff = presetMutation({
	tier: "staff",
	stage: "active",
	onboarding: "clear",
	access: false,
});
export const member = presetMutation({
	tier: "member",
	stage: "active",
	onboarding: "full-seen",
	access: true,
});
export const guest = presetMutation({
	tier: "guest",
	stage: "active",
	onboarding: "full-seen",
	access: true,
});

// Approved-not-confirmed: the onboarding wizard runs from step 1.
export const memberOnboarding = presetMutation({
	tier: "member",
	stage: "onboarding",
	onboarding: "clear",
	access: false,
});
export const guestOnboarding = presetMutation({
	tier: "guest",
	stage: "onboarding",
	onboarding: "clear",
	access: false,
});

// Confirmed, but onboarding-complete-yet-unseen so the Welcome Tour auto-fires.
export const memberTour = presetMutation({
	tier: "member",
	stage: "active",
	onboarding: "full-unseen",
	access: true,
});
export const guestTour = presetMutation({
	tier: "guest",
	stage: "active",
	onboarding: "full-unseen",
	access: true,
});

// No access. Renamed from `applicant`: the tier is `prospect` now.
export const prospect = presetMutation({
	tier: "prospect",
	stage: "denied",
	onboarding: "clear",
	access: false,
});
