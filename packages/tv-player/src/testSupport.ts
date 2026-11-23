import { vi } from "vitest";

import { type PlayerSlide, type Player } from "./createPlayer.ts";

export function html(id: string, durationSec: number): PlayerSlide {
	return { id, kind: "html", durationSec, html: `<p>${id}</p>` };
}
export const slideA = html("a", 5) /* eslint-disable-line @typescript-eslint/no-magic-numbers -- fixture */;
export const slideB = html("b", 10) /* eslint-disable-line @typescript-eslint/no-magic-numbers -- fixture */;
// happy-dom's iframe schedules a timer of its own, so timer-count assertions use images.
export function image(id: string, durationSec = 5): PlayerSlide {
	return {
		id,
		kind: "image",
		durationSec,
		imageUrl: "data:image/png;base64,AA",
	};
}

/** Shared stage and player for the createPlayer suites; `reset` runs per test. */
export const state: { stage: HTMLElement; player: Player | undefined } = {
	stage: undefined as unknown as HTMLElement,
	player: undefined,
};

export function visibleIds() {
	return [
		...state.stage.querySelectorAll<HTMLElement>("[data-slide-id]"),
	].map((element) => element.dataset.slideId);
}
export function settle() {
	vi.advanceTimersByTime(600) /* eslint-disable-line @typescript-eslint/no-magic-numbers -- past the transition */;
}
export function setup() {
	vi.useFakeTimers();
	state.stage = document.createElement("div");
	document.body.append(state.stage);
}
export function teardown() {
	state.player?.destroy();
	state.player = undefined;
	vi.useRealTimers();
	state.stage.remove();
}
