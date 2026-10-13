const IDLE_FALLBACK_MS = 1_500;

/** Run `fn` once the browser is idle. Returns a cancel function. */
export function whenIdle(fn: () => void): () => void {
	if (typeof requestIdleCallback === "function") {
		const id = requestIdleCallback(fn);
		return () => {
			cancelIdleCallback(id);
		};
	}
	const id = setTimeout(fn, IDLE_FALLBACK_MS);
	return () => {
		clearTimeout(id);
	};
}
