import type { Component } from "solid-js";

import { lazyComponent, type LazyComponent } from "../lazyComponent.tsx";
import type { EntityRow } from "../types.ts";

import type { EntityDescriptor, PeekProps } from "./entityDescriptor.ts";

/** A kind's peek, loaded without Suspense (see `lazyComponent`). */
export type LazyPeek<Row extends EntityRow> = LazyComponent<PeekProps<Row>>;

/**
 * Code-splits a kind's peek so the palette does not load every sheet. While
 * the chunk loads the peek shows nothing, so the page under it stays
 * standing. If the chunk does not arrive the peek closes itself, which
 * clears the open param: a failed load leaves the page as it was, never a
 * blank sheet.
 */
export function lazyPeek<Row extends EntityRow>(
	load: () => Promise<Component<PeekProps<Row>>>
): LazyPeek<Row> {
	return lazyComponent<PeekProps<Row>>(load, {
		loading: () => null,
		failed: () => null,
		onFail: (props) => {
			// eslint-disable-next-line solid/reactivity -- read once, when the load fails
			props.onOpenChange(false);
		},
	});
}

/** Loads a kind's peek ahead of its first open, so the sheet is there to
 *  take the handoff. A failed warm-up is ignored: the open retries it. */
export function warmPeek<Row extends EntityRow>(
	desc: EntityDescriptor<Row>
): void {
	void desc.peek?.preload().catch(() => {});
}
