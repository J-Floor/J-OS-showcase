import type { Result } from "neverthrow";
import { createEffect, createSignal, on } from "solid-js";

import type { ClientError } from "../lib/call.ts";

/**
 * True when an answer arrives for someone other than the one shown now: the
 * screen has moved on, so the refusal must not appear against someone else.
 * Nobody on either side (a batch, a closed drawer) is never late.
 */
export function isLateAnswer(
	askedFor: string | undefined,
	shownNow: string | undefined
): boolean {
	return (
		askedFor !== undefined &&
		shownNow !== undefined &&
		askedFor !== shownNow
	);
}

const DEFAULT_SCOPE = "";

/**
 * The failure of the last action each scope of an area took, shown in that
 * area (`InlineError`). `trackResult` clears that scope's error as the action
 * starts and sets the error's message when it fails, then hands the Result
 * back so the caller can go on after a success.
 *
 * Only the latest attempt of a scope speaks for it: an earlier attempt that
 * fails after a later one of the same scope started is dropped, so a slow
 * refusal never shows over a newer save. Independent actions that share an
 * area (the fields of one drawer) pass their own `scope`, so one's success
 * never drops or clears another's failure; the area shows the most recent
 * failure. Actions on separate targets (rows, categories) belong in separate
 * areas, each beside its own control.
 *
 * With a `key` (the person or item the area shows), the error belongs to that
 * key: it is cleared when the key changes, and a late answer for a previous
 * key is dropped.
 *
 * The Result handed back is always the action's own, even when it was dropped
 * from the area. Act on an Ok only for that action itself (closing the form
 * that made it); never to change what the area shows now, which may belong
 * to a newer attempt or another key.
 */
export function createActionError(key?: () => string | undefined) {
	const [failures, setFailures] = createSignal<
		readonly { scope: string; message: string }[]
	>([]);
	const latestAttempts = new Map<string, number>();
	function error(): string | null {
		return failures().at(-1)?.message ?? null;
	}
	function clearScope(scope: string) {
		setFailures((previous) =>
			previous.filter((failure) => failure.scope !== scope)
		);
	}
	function clear() {
		setFailures([]);
	}
	if (key) createEffect(on(key, clear, { defer: true }));
	async function trackResult<T>(
		action: PromiseLike<Result<T, ClientError>>,
		scope: string = DEFAULT_SCOPE
	): Promise<Result<T, ClientError>> {
		clearScope(scope);
		const attempt = (latestAttempts.get(scope) ?? 0) + 1;
		latestAttempts.set(scope, attempt);
		const askedFor = key?.();
		const result = await action;
		if (
			result.isErr() &&
			attempt === latestAttempts.get(scope) &&
			!isLateAnswer(askedFor, key?.())
		) {
			const message = result.error.message;
			setFailures((previous) => [...previous, { scope, message }]);
		}
		return result;
	}
	return { error, trackResult, clear };
}

export type ActionErrorState = ReturnType<typeof createActionError>;

/** The scope for an autosaved patch: one per set of fields it changes. */
export function scopeOfFields(fields: object): string {
	return Object.keys(fields)
		.toSorted((left, right) => left.localeCompare(right))
		.join(",");
}
