import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPlayer } from "./createPlayer.ts";
import {
	image,
	settle,
	setup,
	slideA,
	slideB,
	state,
	teardown,
	visibleIds,
} from "./testSupport.ts";

beforeEach(setup);
afterEach(teardown);

describe("createPlayer playback", () => {
	it("shows the first slide", () => {
		state.player = createPlayer(state.stage, {
			slides: [slideA, slideB],
			transition: "fade",
		});
		expect(visibleIds()).toEqual(["a"]);
	});
	it("advances after each slide's own duration and wraps", () => {
		state.player = createPlayer(state.stage, {
			slides: [slideA, slideB],
			transition: "none",
		});
		vi.advanceTimersByTime(4999);
		expect(visibleIds()).toEqual(["a"]);
		vi.advanceTimersByTime(1);
		settle();
		expect(visibleIds()).toEqual(["b"]);
		vi.advanceTimersByTime(10_000);
		settle();
		expect(visibleIds()).toEqual(["a"]);
	});
	it("never swaps a single slide", () => {
		state.player = createPlayer(state.stage, {
			slides: [image("a")],
			transition: "fade",
		});
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(60_000);
		expect(visibleIds()).toEqual(["a"]);
	});
	it("leaves the stage empty for no slides", () => {
		state.player = createPlayer(state.stage, {
			slides: [],
			transition: "fade",
		});
		expect(state.stage.children).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});
