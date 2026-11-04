const IDLE_FALLBACK_MS = 1_500;

/** Run `callback` once the browser is idle. Returns a cancel function. */
export function whenIdle(callback: () => void): () => void {
	if (typeof requestIdleCallback === "function") {
		const id = requestIdleCallback(callback);
		return () => {
			cancelIdleCallback(id);
		};
	}
	const id = setTimeout(callback, IDLE_FALLBACK_MS);
	return () => {
		clearTimeout(id);
	};
}
