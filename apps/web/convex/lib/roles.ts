import type { Tier } from "./lifecycleTypes.ts";

/**
 * Tiers with full board-level permissions. "admin" mirrors "board" exactly —
 * same rights, different label (for people who run the space but aren't on the
 * board). Authorization sites test membership of this set / isBoardLevel rather
 * than `=== "board"`, so the two stay in lockstep.
 */
export const BOARD_LEVEL = [
	"board",
	"admin",
] as const satisfies readonly Tier[];

/**
 * Every tier that may sign in. `prospect` has not been decided on and `former`
 * has been removed; neither is a role. `staff` signs in for the door and the
 * board contacts only — see {@link COMMUNITY_TIERS}.
 */
export const ACCESS_TIERS = [
	"guest",
	"member",
	"core",
	"board",
	"admin",
	"staff",
] as const satisfies readonly Tier[];

/**
 * Every tier `SET_ROLE` can target: {@link ACCESS_TIERS} minus `guest`, who is
 * approved and promoted, never given a role directly.
 */
export const ROLE_TIERS = [
	"member",
	"core",
	"board",
	"admin",
	"staff",
] as const satisfies readonly Tier[];

/**
 * The signed-in tiers that take part in the community: events, Wi-Fi,
 * occupancy, notifications. Everyone but `staff`, who gets the door and the
 * board contacts and nothing else.
 */
export const COMMUNITY_TIERS = [
	"guest",
	"member",
	"core",
	"board",
	"admin",
] as const satisfies readonly Tier[];

const ACCESS: ReadonlySet<string> = new Set<string>(ACCESS_TIERS);
const COMMUNITY: ReadonlySet<string> = new Set<string>(COMMUNITY_TIERS);

export function isBoardLevel(
	tier: string | undefined
): tier is "board" | "admin" {
	return tier === "board" || tier === "admin";
}

/** May sign in: one of {@link ACCESS_TIERS}. */
export function isAccessTier(
	tier: string | undefined
): tier is (typeof ACCESS_TIERS)[number] {
	return tier !== undefined && ACCESS.has(tier);
}

/** Takes part in the community: one of {@link COMMUNITY_TIERS}. */
export function isCommunityTier(
	tier: string | undefined
): tier is (typeof COMMUNITY_TIERS)[number] {
	return tier !== undefined && COMMUNITY.has(tier);
}

/** The tier a person leaving `tier` is recorded as (`formerOf`). */
export function formerOfTier(
	tier: Tier
): (typeof ACCESS_TIERS)[number] | undefined {
	return isAccessTier(tier) ? tier : undefined;
}
