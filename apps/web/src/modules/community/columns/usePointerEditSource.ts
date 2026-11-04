import { makeEventListener } from "@solid-primitives/event-listener";
import { onMount } from "solid-js";

/**
 * How the score field is being changed, read from the pointerdown that started
 * it (capture phase, before ark's own handler): a scrubber drag, a +/- button,
 * or neither (typing). Calls `onScrubberRelease` when a scrubber drag ends.
 */
export function usePointerEditSource(onScrubberRelease: () => void) {
	let source: "scrubber" | "button" | null = null;
	function onDown(event: PointerEvent) {
		const target = event.target as Element | null;
		if (target?.closest('[data-part="scrubber"]')) source = "scrubber";
		else if (
			target?.closest(
				'button[aria-label="Increment"], button[aria-label="Decrement"]'
			)
		)
			source = "button";
		else source = null;
	}
	function onUp() {
		if (source === "scrubber") onScrubberRelease();
		source = null;
	}
	onMount(() => {
		makeEventListener(document, "pointerdown", onDown, true);
		makeEventListener(document, "pointerup", onUp, true);
	});
	return () => source;
}
