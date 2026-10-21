import { err, ok } from "neverthrow";
import { afterEach, expect, test, vi } from "vitest";

import { isTimeout, withTimeout } from "./withTimeout.ts";

afterEach(() => {
	vi.useRealTimers();
});

test("resolves with the work's Result and leaves no timer pending", async () => {
	vi.useFakeTimers();
	const result = await withTimeout(Promise.resolve(ok(7)), 1000);
	expect(result._unsafeUnwrap()).toBe(7);
	expect(vi.getTimerCount()).toBe(0);
});

test("fails with Timeout once the time is up", async () => {
	vi.useFakeTimers();
	const pending = withTimeout(new Promise<never>(() => {}), 1000);
	await vi.advanceTimersByTimeAsync(1000);
	const result = await pending;
	expect(result._unsafeUnwrapErr()).toEqual({ code: "Timeout" });
});

test("passes the work's own Err through", async () => {
	vi.useFakeTimers();
	const result = await withTimeout(Promise.resolve(err("boom")), 1000);
	expect(result._unsafeUnwrapErr()).toBe("boom");
	expect(vi.getTimerCount()).toBe(0);
});

test("isTimeout is true only for the timeout withTimeout settles with", async () => {
	vi.useFakeTimers();
	const pending = withTimeout(new Promise<never>(() => {}), 1000);
	await vi.advanceTimersByTimeAsync(1000);
	const timedOut = await pending;
	expect(isTimeout(timedOut._unsafeUnwrapErr())).toBe(true);
	expect(isTimeout({ code: "Unknown", message: "Could not save." })).toBe(
		false
	);
	expect(
		isTimeout({ code: "Timeout", message: "The server timed out." })
	).toBe(false);
	expect(isTimeout("boom")).toBe(false);
});
