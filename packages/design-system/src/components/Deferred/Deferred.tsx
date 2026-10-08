import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";

import { afterPaint } from "../../utils/afterPaint.ts";

let immediate = false;

/** Test hook: when true, every `Deferred` created afterwards renders its
 *  children synchronously, so jsdom tests can assert on content without
 *  awaiting a paint. The test setup files set this; app code never does. */
export function setDeferredImmediate(value: boolean): void {
	immediate = value;
}

/**
 * Paint first, build second.
 *
 * Renders `fallback` (a skeleton), waits for the browser to paint it, then
 * mounts `children`. Solid builds the children synchronously inside one task,
 * and the browser cannot paint mid-task, so the swap from fallback to finished
 * content is atomic on screen. The user sees the skeleton at once, then the
 * whole content, never a half-built body.
 *
 * Why a paint and not a microtask: a microtask runs before the browser
 * paints, so the fallback would never reach the screen (see `afterPaint`).
 *
 * `hold`: an extra gate on top of the paint wait, for a caller that already
 * has its own "not ready yet" signal (e.g. a table waiting on its data query).
 * While `hold` is true, `children` stay unmounted and `fallback` stays on
 * screen, regardless of whether the one-paint wait has already elapsed — the
 * paint timer still runs in the background, so once `hold` goes false the
 * swap is immediate if the wait already elapsed, or happens as soon as it
 * elapses otherwise. This lets a caller nest "loading" and "deferred" into
 * one skeleton instead of two stacked `<Show>`/`<Deferred>` pairs that both
 * render the same fallback.
 */
export function Deferred(props: {
	fallback: JSX.Element;
	children: JSX.Element;
	hold?: boolean;
}): JSX.Element {
	const [ready, setReady] = createSignal(immediate);
	onMount(() => {
		if (ready()) return;
		onCleanup(afterPaint(() => setReady(true)));
	});
	return (
		<Show when={ready() && !props.hold} fallback={props.fallback}>
			{props.children}
		</Show>
	);
}
