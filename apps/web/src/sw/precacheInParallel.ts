import type { UpdateProgress } from "../lib/updateProgress.ts";

export const PRECACHE_CONCURRENCY = 6;

export type PrecacheInParallelOptions<T> = {
	entries: readonly T[];
	isCached: (entry: T) => Promise<boolean>;
	fetchOne: (entry: T) => Promise<void>;
	concurrency: number;
	onProgress: (progress: UpdateProgress) => void;
};

/**
 * Downloads the entries that are not cached yet, `concurrency` at a time,
 * and reports `{ done, total }` over those entries only. Workbox's own
 * install downloads one entry at a time, so an update costs one round trip
 * per changed file. The first failed download rejects the whole install, as
 * Workbox's does.
 */
export async function precacheInParallel<T>(
	options: PrecacheInParallelOptions<T>
): Promise<void> {
	const { entries, isCached, fetchOne, concurrency, onProgress } = options;
	const cached = await Promise.all(entries.map((entry) => isCached(entry)));
	const missing = entries.filter((_, index) => !cached[index]);
	const total = missing.length;
	let done = 0;
	let next = 0;
	let isFailed = false;
	onProgress({ done, total });

	async function worker(): Promise<void> {
		while (!isFailed && next < missing.length) {
			const entry = missing[next++];
			const pending = fetchOne(entry);
			// Registered before the await, so these reactions run first: the
			// counts and `isFailed` are up to date when the loop resumes, and the
			// await still rejects with the original error.
			void pending.then(
				() => {
					if (isFailed) return;
					done++;
					onProgress({ done, total });
				},
				() => {
					isFailed = true;
				}
			);
			await pending;
		}
	}

	await Promise.all(
		Array.from(
			{ length: Math.min(Math.max(1, concurrency), total) },
			worker
		)
	);
}
