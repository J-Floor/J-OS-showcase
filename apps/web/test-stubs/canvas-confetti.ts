// Test stub for canvas-confetti: jsdom/edge-runtime has no 2D canvas context, so
// the real module's animation loop throws "Cannot read properties of null
// (reading 'clearRect')". Aliased in vite.config.ts under test, so EVERY import
// (app code and the design system's `fireConfetti`) resolves here — a no-op.
type ConfettiFn = (() => Promise<void>) & { create?: () => ConfettiFn; reset?: () => void };

const confetti: ConfettiFn = () => Promise.resolve();
confetti.create = () => confetti;
confetti.reset = () => {};

export default confetti;
