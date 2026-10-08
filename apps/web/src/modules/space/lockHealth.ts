/** The shape the door-health action returns. `unavailable` is the
 *  offline subset; `locks` names every configured lock when the cache is fresh. */
export type DoorHealth = {
	configured: number;
	unavailable: { name: string }[];
	locks?: { name: string; online: boolean }[];
};

export type LockHealthSummary = {
	/** "online/configured", e.g. "1/2", for the tile's headline number. */
	value: string;
	/** One human line: reassurance when all online, the offending door(s) when
	 *  not. */
	detail: string;
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
export function lockHealthSummary(health: DoorHealth): LockHealthSummary {
	const offline = health.unavailable;
	const value = `${String(health.configured - offline.length)}/${String(health.configured)}`;
	if (offline.length === 0)
		return { value, detail: "Every door is online.", tone: "neutral" };
	const names = offline.map((l) => l.name).join(", ");
	return {
		value,
		detail: `${names} offline — the app can't reach it right now.`,
		tone: "error",
	};
}
