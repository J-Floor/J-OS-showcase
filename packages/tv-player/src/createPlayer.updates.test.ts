import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPlayer } from "./createPlayer.ts";
import {
	html,
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

describe("createPlayer updates", () => {
	it("keeps the timer when the current slide id still exists", () => {
		state.player = createPlayer(state.stage, {
			slides: [slideA, slideB],
			transition: "none",
		});
		vi.advanceTimersByTime(4000);
		state.player.setSlides([slideA, slideB]);
		vi.advanceTimersByTime(1000);
		settle();
		expect(visibleIds()).toEqual(["b"]);
	});
	it("moves to the next slide when the current one is removed", () => {
		const slideC = html("c", 5);
		state.player = createPlayer(state.stage, {
			slides: [slideA, slideB, slideC],
			transition: "none",
		});
		vi.advanceTimersByTime(5000);
		settle();
		expect(visibleIds()).toEqual(["b"]);
		state.player.setSlides([slideA, slideC]);
		settle();
		expect(visibleIds()).toEqual(["c"]);
	});
	it("destroy removes children and clears timers", () => {
		state.player = createPlayer(state.stage, {
			slides: [image("a"), image("b")],
			transition: "fade",
		});
		vi.advanceTimersByTime(5000);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		state.player.destroy();
		expect(state.stage.children).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("applies the transition class and follows setTransition", () => {
		state.player = createPlayer(state.stage, {
			slides: [slideA, slideB],
			transition: "fade",
		});
		vi.advanceTimersByTime(5000);
		expect(state.stage.querySelector(".tvp-layer.tvp-fade")).not.toBeNull();
		settle();
		state.player.setTransition("slide");
		vi.advanceTimersByTime(10_000);
		expect(
			state.stage.querySelector(".tvp-layer.tvp-slide")
		).not.toBeNull();
		expect(state.stage.querySelector(".tvp-fade")).toBeNull();
	});
	it("swaps the content of the current slide in place when its html changes (no replaceChildren: Chrome 76 lacks it)", () => {
		// The setup file (chrome76.setup.ts) removed it, as on the TV.
		expect(
			(Element.prototype as { replaceChildren?: unknown }).replaceChildren
		).toBeUndefined();
		state.player = createPlayer(state.stage, {
			slides: [slideA, slideB],
			transition: "none",
		});
		const layer = state.stage.querySelector(".tvp-layer");
		state.player.setSlides([{ ...slideA, html: "<p>new</p>" }, slideB]);
		const frames = state.stage.querySelectorAll("iframe");
		expect(frames).toHaveLength(1);
		expect(frames[0]?.srcdoc).toBe("<p>new</p>");
		expect(state.stage.querySelector(".tvp-layer")).toBe(layer);
	});
});
