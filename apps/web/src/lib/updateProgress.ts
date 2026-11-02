/** The channel a new service worker reports its precache progress on, and
 * the message it sends. Shared by the worker (src/sw) and the page
 * (pwaUpdates.ts). */
export const UPDATE_CHANNEL = "jf-sw-update";

const PRECACHE_PROGRESS = "precache-progress";

export type UpdateProgress = { done: number; total: number };

export type PrecacheProgressMessage = {
	type: typeof PRECACHE_PROGRESS;
} & UpdateProgress;

export function precacheProgressMessage(
	progress: UpdateProgress
): PrecacheProgressMessage {
	return { type: PRECACHE_PROGRESS, ...progress };
}

function isCount(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** The progress in a channel message, or `undefined` for anything else. */
export function readPrecacheProgress(
	data: unknown
): UpdateProgress | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const { type, done, total } = data as Record<string, unknown>;
	const isWellFormed =
		type === PRECACHE_PROGRESS &&
		isCount(done) &&
		isCount(total) &&
		done <= total;
	return isWellFormed ? { done, total } : undefined;
}
