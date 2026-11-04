import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { developmentAdminEmail } from "./lib/devAdmin.ts";
import {
	applyPreset,
	BOARD_PRESET,
	MEMBER_PRESET,
	type Preset,
} from "./lib/presets.ts";

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

const emailArgument = { email: v.optional(v.string()) };

/** Define a zero-arg (optional email) dev mutation for one target state. */
function presetMutation(preset: Preset) {
	return internalMutation({
		args: emailArgument,
		handler: (context, { email }) =>
			applyPreset(context, preset, email ?? developmentAdminEmail()),
	});
}

export const board = presetMutation(BOARD_PRESET);
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
export const member = presetMutation(MEMBER_PRESET);
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
