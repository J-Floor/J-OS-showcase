// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";

import { morph } from "./morph.ts";

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(document, "startViewTransition");
});

test("without View Transitions it just runs the update", async () => {
	const update = vi.fn();
	const done = morph(update);
	expect(update).toHaveBeenCalledTimes(1);
	await expect(done).resolves.toBeUndefined();
});

test("with View Transitions it runs the update inside one and resolves when it finishes", async () => {
	let finish: (() => void) | undefined;
	const finished = new Promise<undefined>((resolve) => {
		finish = () => {
			resolve(undefined);
		};
	});
	const start = vi.fn((cb: () => unknown) => {
		void cb();
		return { finished };
	});
	Object.assign(document, { startViewTransition: start });
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const update = vi.fn();
	let resolved = false;
	void morph(update).then(() => {
		resolved = true;
	});
	expect(start).toHaveBeenCalledTimes(1);
	expect(update).toHaveBeenCalledTimes(1);
	await Promise.resolve();
	expect(resolved).toBe(false);
	finish?.();
	await vi.waitFor(() => {
		expect(resolved).toBe(true);
	});
});

test("a skipped transition still resolves", async () => {
	Object.assign(document, {
		startViewTransition: () => ({
			finished: Promise.reject(new Error("skipped")),
		}),
	});
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	await expect(morph(vi.fn())).resolves.toBeUndefined();
});

test("reduced motion skips the transition", async () => {
	const start = vi.fn();
	Object.assign(document, { startViewTransition: start });
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const update = vi.fn();
	const done = morph(update);
	expect(start).not.toHaveBeenCalled();
	expect(update).toHaveBeenCalledTimes(1);
	await expect(done).resolves.toBeUndefined();
});
