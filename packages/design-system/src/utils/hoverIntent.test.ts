import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { HOVER_INTENT_MS, createHoverIntent } from "./hoverIntent.ts";

function enter(pointerType = "mouse"): PointerEvent {
	return { pointerType } as unknown as PointerEvent;
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

test("fires once the pointer has rested for the default delay", () => {
	const fire = vi.fn();
	const intent = createHoverIntent(fire);
	intent.onPointerEnter(enter());
	vi.advanceTimersByTime(HOVER_INTENT_MS - 1);
	expect(fire).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1);
	expect(fire).toHaveBeenCalledTimes(1);
});

test("leaving before the delay cancels", () => {
	const fire = vi.fn();
	const intent = createHoverIntent(fire);
	intent.onPointerEnter(enter());
	vi.advanceTimersByTime(HOVER_INTENT_MS - 1);
	intent.onPointerLeave();
	vi.advanceTimersByTime(1000);
	expect(fire).not.toHaveBeenCalled();
});

test("a touch never fires", () => {
	const fire = vi.fn();
	const intent = createHoverIntent(fire);
	intent.onPointerEnter(enter("touch"));
	vi.advanceTimersByTime(1000);
	expect(fire).not.toHaveBeenCalled();
});

test("re-entering restarts the delay and honours a custom delay", () => {
	const fire = vi.fn();
	const intent = createHoverIntent(fire, 50);
	intent.onPointerEnter(enter());
	vi.advanceTimersByTime(40);
	intent.onPointerEnter(enter());
	vi.advanceTimersByTime(40);
	expect(fire).not.toHaveBeenCalled();
	vi.advanceTimersByTime(10);
	expect(fire).toHaveBeenCalledTimes(1);
});

test("disposing the owner cancels a pending fire", () => {
	const fire = vi.fn();
	createRoot((dispose) => {
		const intent = createHoverIntent(fire);
		intent.onPointerEnter(enter());
		dispose();
	});
	vi.advanceTimersByTime(HOVER_INTENT_MS);
	expect(fire).not.toHaveBeenCalled();
});
