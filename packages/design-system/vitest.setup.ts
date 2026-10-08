import { setDeferredImmediate } from "./src/components/Deferred/Deferred.tsx";

// jsdom has no ResizeObserver; ark/zag's Tabs.Indicator observes the active tab
// to sync the sliding indicator rect. Stub it so component tests can mount.
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Tables and drawers defer their bodies by one paint in the browser. Tests
// assert synchronously on content, so render it at once here. Deferred's own
// test turns this off locally.
setDeferredImmediate(true);

// jsdom has no canvas, and its `getContext` prints "Not implemented" on every
// call. Answer the way a canvas-less browser would, quietly: the table then
// sizes content columns from their headers, as designed.
HTMLCanvasElement.prototype.getContext = (() =>
	null) as typeof HTMLCanvasElement.prototype.getContext;
if (typeof OffscreenCanvas !== "undefined") {
	OffscreenCanvas.prototype.getContext = (() =>
		null) as typeof OffscreenCanvas.prototype.getContext;
}
