const STORY_MS = 10_000;
const REVEAL_MS = 700;
const END = 1.25;

/** Independent clocks: scrolling can reveal controls without seeking the story. */
export function createIntroPlayback(
	draw: (story: number, reveal: number) => void,
	reduced: MediaQueryList
) {
	let story = 0;
	let reveal = 0;
	let hasRequestedReveal = false;
	let previous: number | undefined;
	let frame = 0;
	let isDisposed = false;
	function refresh() {
		draw(story, reveal);
	}
	function schedule() {
		if (!frame && !isDisposed && !document.hidden && !reduced.matches)
			frame = requestAnimationFrame(tick);
	}
	function tick(now: number) {
		frame = 0;
		const delta = previous === undefined ? 0 : now - previous;
		previous = now;
		story = Math.min(END, story + delta / STORY_MS);
		if (hasRequestedReveal || story >= 1.04)
			reveal = Math.min(1, reveal + delta / REVEAL_MS);
		refresh();
		if (story < END || reveal < 1) schedule();
	}
	function requestReveal() {
		hasRequestedReveal = true;
		schedule();
	}
	function revealNow() {
		hasRequestedReveal = true;
		reveal = 1;
		refresh();
		schedule();
	}
	function settle() {
		cancelAnimationFrame(frame);
		frame = 0;
		story = END;
		reveal = 1;
		refresh();
	}
	function visibility() {
		previous = undefined;
		if (document.hidden) {
			cancelAnimationFrame(frame);
			frame = 0;
		} else schedule();
	}
	document.addEventListener("visibilitychange", visibility);
	schedule();
	return {
		refresh,
		start: schedule,
		revealNow,
		requestReveal,
		settle,
		dispose: () => {
			isDisposed = true;
			cancelAnimationFrame(frame);
			document.removeEventListener("visibilitychange", visibility);
		},
	};
}
