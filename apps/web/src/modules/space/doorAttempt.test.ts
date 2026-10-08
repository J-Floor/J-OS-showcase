// @vitest-environment happy-dom
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

/** Which attempt ids the mocked query subscribed to, and closed. */
const subscriptions = vi.hoisted(() => ({
	opened: [] as string[],
	closed: [] as string[],
	/** Ids whose data stays undefined until released. */
	held: new Set<string>(),
	release: new Map<string, () => void>(),
}));

vi.mock("convex-solidjs", async () => {
	const { onCleanup, createSignal } = await import("solid-js");
	return {
		useQuery: (_ref: unknown, args: { id: string }) => {
			subscriptions.opened.push(args.id);
			onCleanup(() => {
				subscriptions.closed.push(args.id);
			});
			const [loaded, setLoaded] = createSignal(
				!subscriptions.held.has(args.id)
			);
			subscriptions.release.set(args.id, () => setLoaded(true));
			return {
				data: () =>
					loaded()
						? {
								actuation: "accepted",
								durationMs: 3000,
								requestedAt: 0,
								id: args.id,
							}
						: undefined,
				isLoading: () => false,
				error: () => undefined,
			};
		},
	};
});

import { createDoorAttempt } from "./doorAttempt.ts";

function attemptId(value: string): Id<"doorLog"> {
	return value as Id<"doorLog">;
}

afterEach(() => {
	subscriptions.opened = [];
	subscriptions.closed = [];
	subscriptions.held.clear();
	subscriptions.release.clear();
});

test("follows nothing until it is given an attempt id", () => {
	createRoot((dispose) => {
		const attempt = createDoorAttempt();
		expect(attempt.result()).toBeUndefined();
		expect(subscriptions.opened).toEqual([]);
		dispose();
	});
});

test("each attempt gets its own subscription, and the previous one is closed", () => {
	createRoot((dispose) => {
		const attempt = createDoorAttempt();
		attempt.watch(attemptId("a"));
		expect(attempt.result()).toMatchObject({ id: "a" });
		attempt.watch(attemptId("b"));
		expect(attempt.result()).toMatchObject({ id: "b" });
		expect(subscriptions.opened).toEqual(["a", "b"]);
		expect(subscriptions.closed).toEqual(["a"]);
		attempt.stop();
		expect(attempt.result()).toBeUndefined();
		expect(subscriptions.closed).toEqual(["a", "b"]);
		dispose();
	});
});

test("closes the open subscription when its owner is disposed", () => {
	createRoot((dispose) => {
		createDoorAttempt().watch(attemptId("a"));
		dispose();
	});
	expect(subscriptions.closed).toEqual(["a"]);
});

test("a second attempt reads as loading, not as the first one's data", () => {
	subscriptions.held.add("b");
	createRoot((dispose) => {
		const attempt = createDoorAttempt();
		attempt.watch(attemptId("a"));
		expect(attempt.result()).toMatchObject({ id: "a" });
		attempt.watch(attemptId("b"));
		expect(attempt.result()).toBeUndefined();
		subscriptions.release.get("b")?.();
		expect(attempt.result()).toMatchObject({ id: "b" });
		dispose();
	});
});

test("opens no subscription when watched after its owner is disposed", () => {
	let attempt!: ReturnType<typeof createDoorAttempt>;
	createRoot((dispose) => {
		attempt = createDoorAttempt();
		dispose();
	});
	attempt.watch(attemptId("a"));
	expect(subscriptions.opened).toEqual([]);
	expect(attempt.result()).toBeUndefined();
});
