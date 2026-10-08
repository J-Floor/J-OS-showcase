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
