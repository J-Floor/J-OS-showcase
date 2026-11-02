import { describe, expect, it } from "vitest";

import type { UpdateProgress } from "../lib/updateProgress.ts";

import { precacheInParallel } from "./precacheInParallel.ts";

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function flush(): Promise<void> {
	return new Promise((done) => {
		setTimeout(done, 0);
	});
}

describe("precacheInParallel", () => {
	it("fetches only uncached entries and reports done of total", async () => {
		const fetched: string[] = [];
		const progress: UpdateProgress[] = [];
		await precacheInParallel({
			entries: ["a", "b", "c", "d"],
			isCached: (entry) =>
				Promise.resolve(entry === "b" || entry === "d"),
			fetchOne: (entry) => {
				fetched.push(entry);
				return Promise.resolve();
			},
			concurrency: 6,
			onProgress: (update) => progress.push(update),
		});
		expect(
			fetched.toSorted((left, right) => left.localeCompare(right))
		).toEqual(["a", "c"]);
		expect(progress).toEqual([
			{ done: 0, total: 2 },
			{ done: 1, total: 2 },
			{ done: 2, total: 2 },
		]);
	});

	it("never has more than `concurrency` fetches in flight", async () => {
		const gates = Array.from({ length: 5 }, deferred);
		let inFlight = 0;
		let maxInFlight = 0;
		const run = precacheInParallel({
			entries: [0, 1, 2, 3, 4],
			isCached: () => Promise.resolve(false),
			fetchOne: async (index) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await gates[index].promise;
				inFlight--;
			},
			concurrency: 2,
			onProgress: () => {},
		});
		for (const gate of gates) {
			await flush();
			gate.resolve();
		}
		await run;
		expect(maxInFlight).toBe(2);
	});

	it("rejects when a fetch fails and starts no new fetches", async () => {
		const started: number[] = [];
		const gate = deferred();
		const run = precacheInParallel({
			entries: [0, 1, 2, 3],
			isCached: () => Promise.resolve(false),
			fetchOne: async (index) => {
				started.push(index);
				if (index === 0) throw new Error("network");
				await gate.promise;
			},
			concurrency: 2,
			onProgress: () => {},
		});
		await expect(run).rejects.toThrow("network");
		gate.resolve();
		await flush();
		expect(started).toEqual([0, 1]);
	});

	it("reports no progress from fetches that finish after a failure", async () => {
		const gate = deferred();
		const progress: UpdateProgress[] = [];
		const run = precacheInParallel({
			entries: [0, 1],
			isCached: () => Promise.resolve(false),
			fetchOne: async (index) => {
				if (index === 0) throw new Error("network");
				await gate.promise;
			},
			concurrency: 2,
			onProgress: (update) => progress.push(update),
		});
		await expect(run).rejects.toThrow("network");
		gate.resolve();
		await flush();
		expect(progress).toEqual([{ done: 0, total: 2 }]);
	});

	it("uses at least one worker when concurrency is not positive", async () => {
		const fetched: string[] = [];
		await precacheInParallel({
			entries: ["a", "b"],
			isCached: () => Promise.resolve(false),
			fetchOne: (entry) => {
				fetched.push(entry);
				return Promise.resolve();
			},
			concurrency: 0,
			onProgress: () => {},
		});
		expect(fetched).toEqual(["a", "b"]);
	});

	it("reports 0 of 0 when everything is cached", async () => {
		const progress: UpdateProgress[] = [];
		await precacheInParallel({
			entries: ["a"],
			isCached: () => Promise.resolve(true),
			fetchOne: () => Promise.reject(new Error("must not fetch")),
			concurrency: 6,
			onProgress: (update) => progress.push(update),
		});
		expect(progress).toEqual([{ done: 0, total: 0 }]);
	});
});
