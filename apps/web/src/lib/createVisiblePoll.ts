import { makeEventListener } from "@solid-primitives/event-listener";
import { onCleanup } from "solid-js";

/**
 * Runs `run` every `ms` while the page is visible, and straight away when it
 * comes back into view. Not on start: the caller makes its own first read.
 * Stops with the current owner.
 */
export function createVisiblePoll(run: () => void, ms: number): void {
	function runIfVisible() {
		if (document.visibilityState === "visible") run();
	}
	const timer = setInterval(runIfVisible, ms);
	onCleanup(() => {
		clearInterval(timer);
	});
	makeEventListener(document, "visibilitychange", runIfVisible);
}
