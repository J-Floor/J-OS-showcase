// convex-test arms each scheduled job with `setTimeout(scheduledTime - now)`.
// Node fires any delay past its 32-bit limit (~24.8 days) after 1 ms, so a
// guest's 30-day window job ran at once, in the middle of whichever test came
// next. A job that far out never comes due during a test: arm nothing.
const MAX_TIMER_MS = 2 ** 31 - 1;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function setTimeout(
	handler: TimerHandler,
	timeout?: number,
	...args: unknown[]
) {
	if (timeout !== undefined && timeout > MAX_TIMER_MS)
		return realSetTimeout(() => {}, MAX_TIMER_MS);
	return realSetTimeout(handler, timeout, ...args);
} as typeof globalThis.setTimeout;

// See packages/design-system/vitest.setup.ts: design-system tables and drawers
// defer their bodies by one paint; tests assert synchronously.
//
// DOM suites only. The Convex suites run under edge-runtime, where importing
// the design-system barrel crashes (Solid's web runtime needs `window`), so
// they must never load it.
if (typeof document !== "undefined") {
	const { setDeferredImmediate } = await import("@j-os/design-system");
	setDeferredImmediate(true);
}
