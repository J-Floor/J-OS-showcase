import { createSignal, Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";

import { PageSkeleton } from "./PageSkeleton.tsx";

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
 * skeleton flash. `preload` itself is internal — nothing outside this module
 * calls it ahead of mount; it just kicks the import off on first render.
 */
export function lazyPage(load: () => Promise<Component>): Component {
	let cached: Component | undefined;
	let inflight: Promise<Component> | undefined;

	function preload(): Promise<Component> {
		// Idempotent for the success path (cached forever), but NOT for a
		// rejection: clearing `inflight` on failure means the AppErrorBoundary's
		// Retry button (which re-renders LazyPage and calls preload() again)
		// actually re-imports instead of replaying the same cached rejection.
		inflight ??= load().then(
			(Loaded) => {
				cached = Loaded;
				return Loaded;
			},
			(e: unknown) => {
				inflight = undefined;
				throw e;
			}
		);
		return inflight;
	}

	function LazyPage() {
		// Signals can hold a function value, but the setter's updater form calls
		// any function argument as `prev => next` — so a loaded/failed value must
		// always be set via `() => value`, never passed directly. The initial
		// value here is exempt (createSignal stores it as-is, unwrapped).
		const [comp, setComp] = createSignal<Component | undefined>(cached);
		const [error, setError] = createSignal<Error>();
		if (!cached) {
			preload().then(
				(Loaded) => setComp(() => Loaded),
				(reason: unknown) =>
					setError(() =>
						reason instanceof Error
							? reason
							: new Error(String(reason))
					)
			);
		}
		return (
			<Show
				when={comp()}
				fallback={
					// A rejected load never resolves `comp`, so the "still loading"
					// branch is where a stored error must surface. `error()` is read
					// inside this Show's own tracked render, so throwing here runs
					// during a render computation (not the promise callback above)
					// and reaches the route's <AppErrorBoundary>.
					<Show when={error()} fallback={<PageSkeleton />}>
						{(e) => {
							throw e();
						}}
					</Show>
				}
			>
				{(C) => <Dynamic component={C()} />}
			</Show>
		);
	}

	return LazyPage;
}
