import { ErrorScreen } from "@j-os/design-system";
import { createSignal, Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";

import { checkForUpdateNow } from "../lib/pwaUpdates.ts";

import { PageSkeleton } from "./PageSkeleton.tsx";

const LOAD_FAILED =
	"This page didn't load. Check your connection and try again.";

/**
 * Code-splits a page component without `solid-js`'s `lazy()` — that pairs
 * with `<Suspense>`, and every Convex query under a page sits under whatever
 * Suspense boundary wraps it (`useQuery` is a `createResource`). A route-level
 * Suspense re-enters its fallback on refetch/keepPreviousData pushes too,
 * detaching the whole page DOM and dropping focus. See
 * suspense-convex-loading-crash: Convex loading is controlled, never
 * Suspense — so this loader is controlled too, not Suspense-based.
 *
 * The loaded component and its in-flight promise are cached at module scope
 * (one `lazyPage(...)` call = one cache), so `preload()` is idempotent and a
 * second mount after a successful load renders synchronously, with no
 * skeleton flash. `preload` is public: prefetch (sidebar hover, palette
 * highlight, idle warm-up) calls it ahead of mount so the chunk is ready.
 */
export type LazyPage = Component & { preload: () => Promise<Component> };

export function lazyPage(load: () => Promise<Component>): LazyPage {
	let cached: Component | undefined;
	let inflight: Promise<Component> | undefined;

	function preload(): Promise<Component> {
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

	function LazyPage() {
		// Signals can hold a function value, but the setter's updater form calls
		// any function argument as `prev => next` — so a loaded/failed value must
		// always be set via `() => value`, never passed directly. The initial
		// value here is exempt (createSignal stores it as-is, unwrapped).
		const [comp, setComp] = createSignal<Component | undefined>(cached);
		const [failed, setFailed] = createSignal(false);

		function start() {
			setFailed(false);
			preload().then(
				(Loaded) => setComp(() => Loaded),
				() => {
					checkForUpdateNow();
					setFailed(true);
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
					<Show when={failed()} fallback={<PageSkeleton />}>
						<ErrorScreen message={LOAD_FAILED} onRetry={start} />
					</Show>
				}
			>
				{(Component) => <Dynamic component={Component()} />}
			</Show>
		);
	}

	return Object.assign(LazyPage, { preload });
}
