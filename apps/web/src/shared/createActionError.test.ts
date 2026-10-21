import { ConvexError } from "convex/values";
import { err, errAsync, okAsync, type Result } from "neverthrow";
import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vitest";

import { call, type ClientError } from "../lib/call.ts";

import { createActionError, isLateAnswer } from "./createActionError.ts";

const REFUSAL = { code: "Forbidden", message: "You can't do that." };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function setup(initialKey?: string) {
	return createRoot((dispose) => {
		const [key, setKey] = createSignal(initialKey);
		const actionError =
			initialKey === undefined
				? createActionError()
				: createActionError(key);
		return { ...actionError, setKey, dispose };
	});
}

test("a refused action shows the server's message and hands the Err back", async () => {
	const area = setup();
	const result = await area.trackResult(
		call(
			Promise.reject(
				new ConvexError({
					code: "Forbidden",
					message: "You can't do that.",
				})
			),
			"Could not save."
		)
	);
	expect(result.isErr() && result.error.code).toBe("Forbidden");
	expect(area.error()).toBe("You can't do that.");
	area.dispose();
});

test("a failure without a server message shows the fallback, never the raw error", async () => {
	const area = setup();
	const result = await area.trackResult(
		call(Promise.reject(new Error("boom")), "Could not save.")
	);
	expect(result.isErr() && result.error.code).toBe("Unknown");
	expect(area.error()).toBe("Could not save.");
	area.dispose();
});

test("a new attempt clears the last failure, and success leaves it clear", async () => {
	const area = setup();
	await area.trackResult(errAsync(REFUSAL));
	expect(area.error()).toBe(REFUSAL.message);
	const pending = deferred<null>();
	const attempt = area.trackResult(call(pending.promise, "Could not save."));
	expect(area.error()).toBeNull();
	pending.resolve(null);
	const result = await attempt;
	expect(result.isOk()).toBe(true);
	expect(area.error()).toBeNull();
	area.dispose();
});

test("clear() drops the shown failure", async () => {
	const area = setup();
	await area.trackResult(errAsync(REFUSAL));
	area.clear();
	expect(area.error()).toBeNull();
	area.dispose();
});

test("with a key, changing the key drops the failure", async () => {
	const area = setup("alice");
	await area.trackResult(errAsync(REFUSAL));
	expect(area.error()).toBe(REFUSAL.message);
	area.setKey("bob");
	expect(area.error()).toBeNull();
	area.dispose();
});

test("with a key, a late answer for the previous key is dropped but still handed back", async () => {
	const area = setup("alice");
	const pending = deferred<null>();
	const attempt = area.trackResult(
		pending.promise.then(() => errAsync(REFUSAL))
	);
	area.setKey("bob");
	pending.resolve(null);
	const result = await attempt;
	expect(result.isErr() && result.error.code).toBe("Forbidden");
	expect(area.error()).toBeNull();
	area.dispose();
});

test("with a key, an answer for the key still shown is kept", async () => {
	const area = setup("alice");
	const result = await area.trackResult(
		okAsync(1).andThen(() => errAsync(REFUSAL))
	);
	expect(result.isErr()).toBe(true);
	expect(area.error()).toBe(REFUSAL.message);
	area.dispose();
});

test("an earlier failure that settles after a later success is dropped but still handed back", async () => {
	const area = setup();
	const earlier = deferred<null>();
	const later = deferred<null>();
	const firstAttempt = area.trackResult(
		earlier.promise.then(() => errAsync(REFUSAL))
	);
	const secondAttempt = area.trackResult(
		call(later.promise, "Could not save.")
	);
	later.resolve(null);
	const second = await secondAttempt;
	expect(second.isOk()).toBe(true);
	earlier.resolve(null);
	const first = await firstAttempt;
	expect(first.isErr() && first.error.code).toBe("Forbidden");
	expect(area.error()).toBeNull();
	area.dispose();
});

test("the latest attempt's failure shows even when an earlier one succeeds after it", async () => {
	const area = setup();
	const earlier = deferred<null>();
	const firstAttempt = area.trackResult(
		call(earlier.promise, "Could not save.")
	);
	await area.trackResult(errAsync(REFUSAL));
	earlier.resolve(null);
	await firstAttempt;
	expect(area.error()).toBe(REFUSAL.message);
	area.dispose();
});

test("isLateAnswer is late only when both sides name different keys", () => {
	expect(isLateAnswer("alice", "bob")).toBe(true);
	expect(isLateAnswer("alice", "alice")).toBe(false);
	expect(isLateAnswer(undefined, "bob")).toBe(false);
	expect(isLateAnswer("alice", undefined)).toBe(false);
});

test("independent scopes keep their own failures: a later success never drops an earlier slow refusal", async () => {
	const area = setup();
	const slow = deferred<Result<number, ClientError>>();
	const first = area.trackResult(slow.promise, "name");
	await area.trackResult(okAsync(1), "leader");
	slow.resolve(err(REFUSAL));
	await first;
	expect(area.error()).toBe("You can't do that.");
	await area.trackResult(okAsync(1), "leader");
	expect(area.error()).toBe("You can't do that.");
	await area.trackResult(okAsync(1), "name");
	expect(area.error()).toBeNull();
	area.dispose();
});
