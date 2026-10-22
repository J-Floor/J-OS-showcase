/**
 * Test doubles for the View Transitions API, shared by the design system's
 * tests. Not exported from the package.
 */
import { expect, vi } from "vitest";

import { isTransitionRunning } from "../utils/viewTransition.ts";

type Update = () => Promise<void> | void;

/** Installs `start` as `document.startViewTransition`, with motion allowed
 *  unless `reducedMotion`. */
export function installViewTransitions(
	start: unknown,
	options: { reducedMotion?: boolean } = {}
): void {
	Object.assign(document, { startViewTransition: start });
	const isReduced = options.reducedMotion ?? false;
	vi.stubGlobal("matchMedia", () => ({ matches: isReduced }));
}

/**
 * A fake `startViewTransition` that runs each update and finishes once it
 * has. The update runs a microtask later, or inside the call with `sync`
 * (some browsers do that). `onStart` runs where the browser takes the old
 * snapshot, `onSnapshot` where it takes the new one.
 */
export function fakeViewTransitions(
	options: {
		sync?: boolean;
		onStart?: () => void;
		onSnapshot?: () => void;
	} = {}
) {
	const start = vi.fn((update: Update) => {
		options.onStart?.();
		const updated = options.sync
			? Promise.resolve(update())
			: Promise.resolve().then(update);
		const done = updated.then(() => {
			options.onSnapshot?.();
		});
		return { finished: done, updateCallbackDone: done };
	});
	installViewTransitions(start);
	return start;
}

/** The ids of the elements matching `selector` that hold a transition name. */
export function namedIds(selector = "*"): string[] {
	return [...document.querySelectorAll<HTMLElement>(selector)]
		.filter((element) =>
			element.style.getPropertyValue("view-transition-name")
		)
		.map((element) => element.id);
}

/** Every element has a layout box (jsdom and happy-dom lay nothing out). */
export function mockLayoutBoxes(): void {
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
}

/** Waits until no transition's update runs, then one task more for what
 *  follows its end (focus restore, cleanup). */
export async function transitionSettled(): Promise<void> {
	await vi.waitFor(() => {
		expect(isTransitionRunning()).toBe(false);
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Captures the errors surfaced through queueMicrotask (an update's, a
 *  cleanup's), instead of letting them fail the run as uncaught. */
export function captureSurfaced(): unknown[] {
	const surfaced: unknown[] = [];
	vi.stubGlobal("queueMicrotask", (task: () => void) => {
		try {
			task();
		} catch (error) {
			surfaced.push(error);
		}
	});
	return surfaced;
}

/** Removes the fake, the `matchMedia` stub and the spies. */
export function restoreViewTransitions(): void {
	Reflect.deleteProperty(document, "startViewTransition");
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
}
