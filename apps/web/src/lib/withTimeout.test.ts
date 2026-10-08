import { afterEach, expect, test, vi } from "vitest";

import { withTimeout } from "./withTimeout.ts";

afterEach(() => {
	vi.useRealTimers();
});

test("resolves with the promise and leaves no timer pending", async () => {
	vi.useFakeTimers();
	await expect(withTimeout(Promise.resolve(7), 1000, "late")).resolves.toBe(
		7
	);
	expect(vi.getTimerCount()).toBe(0);
});

test("rejects with the message once the time is up", async () => {
	vi.useFakeTimers();
	const pending = withTimeout(new Promise<never>(() => {}), 1000, "late");
	const assertion = expect(pending).rejects.toThrow("late");
	await vi.advanceTimersByTimeAsync(1000);
	await assertion;
});

test("passes the promise's own rejection through", async () => {
	vi.useFakeTimers();
	await expect(
		withTimeout(Promise.reject(new Error("boom")), 1000, "late")
	).rejects.toThrow("boom");
	expect(vi.getTimerCount()).toBe(0);
});
