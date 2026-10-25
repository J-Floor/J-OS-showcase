import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SAVED_VISIBLE_MS, createSaveTracker } from "./saveTracker.ts";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function tracker() {
	return createRoot((dispose) => {
		const created = createSaveTracker();
		return { ...created, dispose };
	});
}

/** A write that settles when the test says. */
function write() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

async function flush(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

test("idle before anything is written", () => {
	expect(tracker().state()).toBe("idle");
});

test("a write waiting or in flight is pending; once it resolves it is saved, then idle after the saved time", async () => {
	const saves = tracker();
	const field = saves.track("title");
	field.pending();
	expect(saves.state()).toBe("pending");
	const sent = write();
	field.settle(sent.promise, () => {});
	expect(saves.state()).toBe("pending");
	sent.resolve();
	await flush();
	expect(saves.state()).toBe("saved");
	await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS - 1);
	expect(saves.state()).toBe("saved");
	await vi.advanceTimersByTimeAsync(1);
	expect(saves.state()).toBe("idle");
});

test("pending wins over saved", async () => {
	const saves = tracker();
	const title = saves.track("title");
	title.pending();
	title.settle(Promise.resolve(), () => {});
	await flush();
	saves.track("notes").pending();
	expect(saves.state()).toBe("pending");
});

test("a rejected write is failed, and stays failed until that field saves", async () => {
	const saves = tracker();
	const title = saves.track("title");
	title.pending();
	title.settle(Promise.reject(new Error("offline")), () => {});
	await flush();
	expect(saves.state()).toBe("failed");
	await vi.advanceTimersByTimeAsync(SAVED_VISIBLE_MS);
	expect(saves.state()).toBe("failed");
	const notes = saves.track("notes");
	notes.pending();
	notes.settle(Promise.resolve(), () => {});
	await flush();
	expect(saves.state()).toBe("failed");
	title.pending();
	title.settle(Promise.resolve(), () => {});
	await flush();
	expect(saves.state()).toBe("saved");
});

test("retry re-sends every failed field, and only those", async () => {
	const saves = tracker();
	const retries = { title: vi.fn(), notes: vi.fn(), tag: vi.fn() };
	for (const [id, retry] of Object.entries(retries)) {
		const field = saves.track(id);
		field.pending();
		field.settle(
			id === "tag" ? Promise.resolve() : Promise.reject(new Error(id)),
			retry
		);
	}
	await flush();
	saves.retry();
	expect(retries.title).toHaveBeenCalledOnce();
	expect(retries.notes).toHaveBeenCalledOnce();
	expect(retries.tag).not.toHaveBeenCalled();
});

test("only a field's latest write counts: an older one settling late changes nothing", async () => {
	const saves = tracker();
	const title = saves.track("title");
	const older = write();
	title.pending();
	title.settle(older.promise, () => {});
	const newer = write();
	title.pending();
	title.settle(newer.promise, () => {});
	newer.resolve();
	await flush();
	older.reject(new Error("stale"));
	await flush();
	expect(saves.state()).toBe("saved");
});

test("tracking an id again is the same field: its latest write still wins", async () => {
	const saves = tracker();
	const older = write();
	saves.track("title").pending();
	saves.track("title").settle(older.promise, () => {});
	saves.track("title").pending();
	saves.track("title").settle(Promise.resolve(), () => {});
	await flush();
	older.reject(new Error("stale"));
	await flush();
	expect(saves.state()).toBe("saved");
});

test("a cleared field drops out: no longer pending, and its write settling late changes nothing", async () => {
	const saves = tracker();
	const title = saves.track("title");
	const sent = write();
	title.pending();
	title.settle(sent.promise, () => {});
	title.clear();
	expect(saves.state()).toBe("idle");
	sent.reject(new Error("late"));
	await flush();
	expect(saves.state()).toBe("idle");
});
