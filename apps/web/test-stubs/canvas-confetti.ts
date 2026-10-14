// Test stub for canvas-confetti: jsdom/edge-runtime has no 2D canvas context, so
// the real module's animation loop throws "Cannot read properties of null
// (reading 'clearRect')". Aliased in vite.config.ts under test, so EVERY import
// (app code and the design system's `fireConfetti`) resolves here — a no-op.
type ConfettiFunction = (() => Promise<void>) & {
	create?: () => ConfettiFunction;
	reset?: () => void;
};

function fire(): Promise<void> {
	return Promise.resolve();
}

const confetti: ConfettiFunction = Object.assign(fire, {
	create: () => confetti,
	reset: () => {},
});

// eslint-disable-next-line import-x/no-default-export -- stands in for canvas-confetti, whose API is its default export
export default confetti;
