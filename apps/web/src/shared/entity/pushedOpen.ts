import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, on } from "solid-js";

import type { SetParams } from "../types.ts";

type Navigate = ReturnType<typeof useNavigate>;
type SearchParameters = ReturnType<typeof useSearchParams>[0];

const OPENED_BY_PUSH_KEY = "openedByPush";

/** History state for an in-app push that sets `parameter` on top of the page on
 *  screen, from outside the page's own selection (a search pick, a
 *  notification). The selection that mounts after the push cannot see where
 *  it came from, so it reads this off the entry and claims the entry. Any
 *  write that replaces the entry carrying this marker must pass it on in
 *  `state` (as `writeParameter` does), or the entry stops being recognisable
 *  as one the app pushed. */
export function pushedOpenState(parameter: string): Record<string, string> {
	return { [OPENED_BY_PUSH_KEY]: parameter };
}

export function isPushedOpen(parameter: string): boolean {
	if (typeof window === "undefined") return false;
	const state: unknown = window.history.state;
	return (
		typeof state === "object" &&
		state !== null &&
		OPENED_BY_PUSH_KEY in state &&
		state[OPENED_BY_PUSH_KEY] === parameter
	);
}

/** Removes `parameter` from the URL when asked to. An entry the app pushed
 *  for it is popped (replacing it would leave a duplicate of the page under
 *  it); any other is cleared in place. A pop lands a tick later, so asking
 *  again before it has (an effect re-running) must not pop a second entry and
 *  leave the page: further requests wait until the param has changed. */
export function createParameterClearer(
	parameter: string,
	params: SearchParameters,
	setParams: SetParams,
	navigate: Navigate
): () => void {
	let isPopping = false;
	createEffect(
		on(
			() => params[parameter],
			() => {
				isPopping = false;
			},
			{ defer: true }
		)
	);
	return () => {
		if (isPushedOpen(parameter)) {
			if (isPopping) return;
			isPopping = true;
			navigate(-1);
			return;
		}
		setParams({ [parameter]: undefined }, { replace: true });
	};
}
