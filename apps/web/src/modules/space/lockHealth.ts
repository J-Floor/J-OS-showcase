import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

/** What the door-health action returns. `unavailable` is the offline subset;
 *  `locks` names every configured lock. */
export type DoorHealth = FunctionReturnType<typeof api.doorHealth.doorHealth>;

export type LockHealthSummary = {
	/** "online/configured", e.g. "1/2", for the tile's headline number. */
	value: string;
	/** Drives the tile's colour. `error` the moment any door is unreachable —
	 *  an offline door is exactly what a member needs told, loudly. */
	tone: "neutral" | "error";
};

/**
 * Turn a raw door-health reading into what the Space-page tile shows.
 *
 * Kept pure and separate from the card so the wording and the neutral→error
 * threshold are unit-testable without standing up a Convex action or the DOM.
 */
export function lockHealthSummary(
	health: Pick<DoorHealth, "configured"> & {
		unavailable: readonly unknown[];
	}
): LockHealthSummary {
	const offline = health.unavailable;
	const value = `${String(health.configured - offline.length)}/${String(health.configured)}`;
	return offline.length === 0
		? { value, tone: "neutral" }
		: { value, tone: "error" };
}
