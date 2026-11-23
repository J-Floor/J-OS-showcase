import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPlayer, type PlayerSlide } from "./createPlayer.ts";
import {
	setup,
	slideA,
	state,
	teardown,
} from "./testSupport.ts";

beforeEach(setup);
afterEach(teardown);

describe("createPlayer rendering", () => {
	it("renders html in an iframe with an empty sandbox", () => {
		state.player = createPlayer(state.stage, {
			slides: [slideA],
			transition: "fade",
		});
		const iframe = state.stage.querySelector("iframe");
		expect(iframe?.getAttribute("sandbox")).toBe("");
		expect(iframe?.getAttribute("srcdoc")).toBe("<p>a</p>");
	});
	it("renders images as img with empty alt", () => {
		const img: PlayerSlide = {
			id: "i",
			kind: "image",
			durationSec: 5,
			imageUrl: "data:image/png;base64,AA",
		};
		state.player = createPlayer(state.stage, {
			slides: [img],
			transition: "fade",
		});
		const element = state.stage.querySelector("img");
		expect(element?.getAttribute("alt")).toBe("");
		expect(element?.getAttribute("src")).toBe("data:image/png;base64,AA");
	});
});
