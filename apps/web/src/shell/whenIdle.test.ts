import { afterEach, expect, it, vi } from "vitest";

import { whenIdle } from "./whenIdle.ts";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("falls back to a timer when the browser has no idle callback", () => {
	vi.stubGlobal("requestIdleCallback", undefined);
	vi.useFakeTimers();
	const callback = vi.fn();
	whenIdle(callback);
	expect(callback).not.toHaveBeenCalled();
	vi.runAllTimers();
	expect(callback).toHaveBeenCalledOnce();
});

it("the fallback timer can be cancelled", () => {
	vi.stubGlobal("requestIdleCallback", undefined);
	vi.useFakeTimers();
	const callback = vi.fn();
	whenIdle(callback)();
	vi.runAllTimers();
	expect(callback).not.toHaveBeenCalled();
});
