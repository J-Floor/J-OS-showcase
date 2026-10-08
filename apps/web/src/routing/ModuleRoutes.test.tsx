// @vitest-environment happy-dom
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { modules } from "../modules/registry.ts";

// lazyPage() (used by every module manifest) imports PageSkeleton, which
// imports @j-os/design-system — whose components (e.g. Chart) register DOM
// event delegation at module load. edge-runtime has no `document`, hence the
// jsdom pragma above even though this test never lets a real page mount.

afterEach(() => {
	cleanup();
});

// Each module's `view` is a lazyPage()-wrapped component. Asserting laziness
// behaviourally (skeleton first, not the page) rather than checking for a
// `.preload` marker proves the registry is actually wired through lazyPage,
// not just shaped like it.
//
// Rendering the real page components would need each module's own providers
// (Convex, Ability, Router...) wired up — heavy, and beside the point of this
// test. Instead this renders each `View` and asserts ONLY the synchronous
// first paint, before the dynamic import's promise can resolve: at that
// point the loading skeleton must be on screen and the real page must not
// be. The promise is never awaited, so the real page component never
// mounts and no module-specific providers are needed.
test("every module view renders the loading skeleton first, not the real page", () => {
	for (const m of modules) {
		const View = m.view;
		const { container, unmount } = render(() => <View />);
		expect(
			container.querySelectorAll("[data-skeleton-row]").length
		).toBeGreaterThan(0);
		// Not just "a skeleton is present somewhere" — the ONLY thing on
		// screen is PageSkeleton's TableSkeleton root. A real page that
		// happens to render its own loading Table (also stamping
		// `data-skeleton-row`) would pass the assertion above; this rules
		// that out by requiring the container's one child to BE the
		// top-level loading placeholder, not some other page-shaped subtree.
		expect(container.childElementCount).toBe(1);
		expect(
			container.querySelector('[role="status"][aria-label="Loading"]')
		).toBe(container.firstElementChild);
		unmount();
	}
});
