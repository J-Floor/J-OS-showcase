const DAY_MS = 86_400_000;

/** Whole days remaining until `accessUntil` (epoch ms), floored at 0. */
export function daysLeft(accessUntil: number, now: number): number {
	return Math.max(0, Math.ceil((accessUntil - now) / DAY_MS));
}
