import { afterEach, expect, it, vi } from "vitest";

import { whenIdle } from "./whenIdle.ts";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("falls back to a timer when the browser has no idle callback", () => {
	vi.stubGlobal("requestIdleCallback", undefined);
	vi.useFakeTimers();
	const fn = vi.fn();
	whenIdle(fn);
	expect(fn).not.toHaveBeenCalled();
	vi.runAllTimers();
	expect(fn).toHaveBeenCalledOnce();
});

it("the fallback timer can be cancelled", () => {
	vi.stubGlobal("requestIdleCallback", undefined);
	vi.useFakeTimers();
	const fn = vi.fn();
	whenIdle(fn)();
	vi.runAllTimers();
	expect(fn).not.toHaveBeenCalled();
});
