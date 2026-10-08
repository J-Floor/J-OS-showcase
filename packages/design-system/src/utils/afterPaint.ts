/**
 * Runs `callback` just after the browser's next paint and returns a function
 * that cancels it. `requestAnimationFrame` fires just before the paint, and a
 * `setTimeout(0)` inside it lands just after: a frame alone would land in the
 * same style pass as whatever the caller wants painted first.
 */
export function afterPaint(callback: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const frame = requestAnimationFrame(() => {
		timer = setTimeout(callback, 0);
	});
	return () => {
		cancelAnimationFrame(frame);
		if (timer !== undefined) clearTimeout(timer);
	};
}
