import { ErrorScreen } from "@j-os/design-system";
import type { Component } from "solid-js";

import { lazyComponent, type LazyComponent } from "./lazyComponent.tsx";
import { PageSkeleton } from "./PageSkeleton.tsx";

const LOAD_FAILED =
	"This page didn't load. Check your connection and try again.";

/**
 * Code-splits a page component, controlled rather than `lazy()` + Suspense:
 * see `lazyComponent`. While the chunk loads the page shows `PageSkeleton`; if
 * it fails, an `ErrorScreen` with a retry. `preload()` is public so prefetch
 * (sidebar hover, palette highlight, idle warm-up) can load the chunk ahead.
 */
export type LazyPage = LazyComponent<object>;

export function lazyPage(load: () => Promise<Component>): LazyPage {
	return lazyComponent<object>(load, {
		loading: () => <PageSkeleton />,
		failed: (retry) => (
			<ErrorScreen message={LOAD_FAILED} onRetry={retry} />
		),
	});
}
