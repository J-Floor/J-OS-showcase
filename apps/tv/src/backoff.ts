const FIRST_MINUTES = 5;
const MAX_MINUTES = 60;
const MINUTE_MS = 60_000;

/** A version that failed is not asked for again for this long, then double, up to the cap. */
const RETRY_FIRST_MS = FIRST_MINUTES * MINUTE_MS;
const RETRY_MAX_MS = MAX_MINUTES * MINUTE_MS;

export type Backoff = {
	/** True while `version` failed and its wait has not run out. A different version is never held back. */
	isBackedOff(version: number): boolean;
	recordFailure(version: number): void;
	clear(): void;
};

type Failure = { version: number; attempts: number; retryAt: number };

export function createBackoff(options: {
	firstMs?: number;
	maxMs?: number;
	now?: () => number;
}): Backoff {
	const firstMs = options.firstMs ?? RETRY_FIRST_MS;
	const maxMs = options.maxMs ?? RETRY_MAX_MS;
	const now = options.now ?? (() => Date.now());
	let failed: Failure | undefined;
	return {
		isBackedOff(version) {
			if (failed?.version !== version) return false;
			const remaining = failed.retryAt - now();
			// A wait longer than the maximum means the clock went back since it was set.
			return remaining > 0 && remaining <= maxMs;
		},
		recordFailure(version) {
			const attempts =
				failed?.version === version ? failed.attempts + 1 : 1;
			const delay = Math.min(firstMs * 2 ** (attempts - 1), maxMs);
			failed = { version, attempts, retryAt: now() + delay };
		},
		clear() {
			failed = undefined;
		},
	};
}
