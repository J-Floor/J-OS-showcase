import type { MutationCtx } from "../_generated/server";

import { DAY_MS, NINETY_DAYS } from "./constants.ts";
import { normalizeEmail, personByEmail } from "./emailAddress.ts";
import type { Tier } from "./lifecycleTypes.ts";
import { SELF_STEP_IDS } from "./onboardingSteps.ts";
import { syncSignedVariants } from "./signatures.ts";

/**
 * Account states an operator can put one person into: the dev
 * impersonation mutations (`dev.ts`) and the staging seed (`staging.ts`).
 */
export type Preset = {
	tier: Exclude<Tier, "former" | "visitor">;
	stage: "onboarding" | "active" | "verified" | "denied";
	onboarding: "clear" | "full-seen" | "full-unseen";
	access: boolean;
};

export type PersonName = { firstName: string; lastName: string };

// Settled, full access (onboarding done, tour already seen).
export const BOARD_PRESET: Preset = {
	tier: "board",
	stage: "active",
	onboarding: "clear",
	access: false,
};

export const MEMBER_PRESET: Preset = {
	tier: "member",
	stage: "active",
	onboarding: "full-seen",
	access: true,
};

const DEFAULT_NAME: PersonName = { firstName: "J Floor", lastName: "Dev" };

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

/**
 * Drive `email`'s person to the given state, creating them if needed. An
 * existing person keeps their name; a new one gets `name`.
 */
export async function applyPreset(
	context: MutationCtx,
	preset: Preset,
	email: string,
	name: PersonName = DEFAULT_NAME
) {
	const addr = normalizeEmail(email);
	const now = Date.now();

	const existing = await personByEmail(context, addr);

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
		...name,
		...fields,
	});
	return { person: id };
}
