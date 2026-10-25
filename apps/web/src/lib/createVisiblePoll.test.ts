// @vitest-environment happy-dom
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVisiblePoll } from "./createVisiblePoll.ts";

const EVERY_MS = 1000;

function setVisibility(state: DocumentVisibilityState) {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}

function start(run: () => void): () => void {
	return createRoot((dispose) => {
		createVisiblePoll(run, EVERY_MS);
		return dispose;
	});
}

describe("createVisiblePoll", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		setVisibility("visible");
	});

	it("runs every interval while the page is visible, not straight away", () => {
		const run = vi.fn();
		const dispose = start(run);
		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(EVERY_MS * 2);
		expect(run).toHaveBeenCalledTimes(2);
		dispose();
	});

	it("skips the ticks while hidden and runs on becoming visible", () => {
		const run = vi.fn();
		const dispose = start(run);
		setVisibility("hidden");
		vi.advanceTimersByTime(EVERY_MS * 3);
		expect(run).not.toHaveBeenCalled();
		setVisibility("visible");
		expect(run).toHaveBeenCalledTimes(1);
		dispose();
	});

	it("stops the timer and the listener with its owner", () => {
		const run = vi.fn();
		const dispose = start(run);
		dispose();
		vi.advanceTimersByTime(EVERY_MS * 3);
		setVisibility("visible");
		expect(run).not.toHaveBeenCalled();
	});
});
