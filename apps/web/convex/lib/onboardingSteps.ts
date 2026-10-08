import type { Tier } from "./lifecycleTypes.ts";

export type OnboardingStepId = "welcome" | "document" | "rules" | "visit";

/** The id the retired door-key onboarding step is stored under in `onboarding.steps` and step events. */
export const RETIRED_DOOR_KEY_STEP_ID = "doorKey";

/**
 * Steps the person completes themselves, in onboarding order. `whatsapp` is
 * deliberately absent: adding someone to the WhatsApp group cannot be
 * automated, so it is a BOARD task that must never gate the person's
 * activation (spec, "Onboarding, split by actor").
 *
 * There is no door-key step: the app opens the doors (Space → Doors), so
 * nobody sets up a personal door key. People who completed the retired
 * door-key step keep a harmless entry under {@link RETIRED_DOOR_KEY_STEP_ID} —
 * the steps record is open-ended.
 */
export const SELF_STEP_IDS = [
	"welcome",
	"document",
	"rules",
	"visit",
] as const satisfies readonly OnboardingStepId[];

export type BoardStepId = "whatsapp";

/** Onboarding work only a board member can do. Surfaced as an open to-do. */
export const BOARD_STEPS = [
	{ id: "whatsapp", label: "Add to WhatsApp group" },
] as const satisfies readonly { id: BoardStepId; label: string }[];

/**
 * The self-serve steps a tier must complete before it can activate. The same
 * list whatever the door state: nothing here is about the door any more.
 */
export function requiredSelfStepIds(tier: Tier): OnboardingStepId[] {
	if (tier !== "guest" && tier !== "member" && tier !== "core") return [];
	return [...SELF_STEP_IDS];
}

/** The next self-serve step this person still owes, or null when none is left. */
export function firstIncompleteSelfStepId(
	tier: Tier,
	steps: Record<string, unknown>
): OnboardingStepId | null {
	return requiredSelfStepIds(tier).find((id) => !(id in steps)) ?? null;
}
