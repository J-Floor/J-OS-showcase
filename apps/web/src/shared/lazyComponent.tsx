import { createSignal, Show, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

import { checkForUpdateNow } from "../lib/pwaUpdates.ts";

/**
 * Code-splits a component without `solid-js`'s `lazy()` — that pairs with
 * `<Suspense>`, and every Convex query under a page or sheet sits under
 * whatever Suspense boundary wraps it (`useQuery` is a `createResource`). A
 * Suspense boundary re-enters its fallback on refetch/keepPreviousData
 * pushes too, detaching the whole DOM under it and dropping focus. See
 * suspense-convex-loading-crash: Convex loading is controlled, never
 * Suspense — so this loader is controlled too, not Suspense-based.
 *
 * The loaded component and its in-flight promise are cached at module scope
 * (one `lazyComponent(...)` call = one cache), so `preload()` is idempotent
 * and a second mount after a successful load renders synchronously, with no
 * fallback flash. `preload` is public: prefetch (sidebar hover, palette
 * highlight, idle warm-up) calls it ahead of mount so the chunk is ready.
 *
 * `loading` is what shows while the chunk is on its way, `failed` what shows
 * when it did not arrive (given a way to retry), and `onFail` runs once per
 * failure for a caller that must react beyond showing something.
 */
export type LazyComponent<Props extends object> = Component<Props> & {
	preload: () => Promise<Component<Props>>;
};

type LazyStates<Props extends object> = {
	loading: () => JSX.Element;
	failed: (retry: () => void) => JSX.Element;
	onFail?: (props: Props) => void;
};

export function lazyComponent<Props extends object>(
	load: () => Promise<Component<Props>>,
	states: LazyStates<Props>
): LazyComponent<Props> {
	let cached: Component<Props> | undefined;
	let inflight: Promise<Component<Props>> | undefined;

	function preload(): Promise<Component<Props>> {
		// Idempotent for the success path (cached forever), but NOT for a
		// failure: clearing `inflight` means Retry re-imports instead of
		// replaying the same cached rejection.
		if (inflight) return inflight;
		const attempt = load();
		inflight = attempt;
		attempt.then(
			(Loaded) => {
				cached = Loaded;
			},
			() => {
				inflight = undefined;
			}
		);
		return attempt;
	}

	function Lazy(props: Props) {
		// Signals can hold a function value, but the setter's updater form calls
		// any function argument as `prev => next` — so a loaded/failed value must
		// always be set via `() => value`, never passed directly. The initial
		// value here is exempt (createSignal stores it as-is, unwrapped).
		const [comp, setComp] = createSignal<Component<Props> | undefined>(
			cached
		);
		const [failed, setFailed] = createSignal(false);

		function start() {
			setFailed(false);
			preload().then(
				(Loaded) => setComp(() => Loaded),
				() => {
					checkForUpdateNow();
					setFailed(true);
					states.onFail?.(props);
				}
			);
		}
		if (!cached) start();
		return (
			<Show
				when={comp()}
				fallback={
					// A failed load never resolves `comp`, so the "still loading"
					// branch is where the failure shows: the usual cause after a
					// deploy is a stale bundle, which the update check addresses.
					<Show when={failed()} fallback={states.loading()}>
						{states.failed(start)}
					</Show>
				}
			>
				{(Loaded) => <Dynamic component={Loaded()} {...props} />}
			</Show>
		);
	}

	return Object.assign(Lazy, { preload });
}
