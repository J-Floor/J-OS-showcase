// Node 25+ ships its own global Web Storage: `localStorage` and
// `sessionStorage` exist on `globalThis`, but are unusable unless Node was
// started with `--localstorage-file`. Vitest's DOM environments only copy the
// window's keys that the global does NOT already have, so under Node 25+ tests
// got Node's broken storage instead of the DOM window's ("Cannot read
// properties of undefined (reading 'clear')"). Point both back at a working
// storage, on DOM suites only (apps/web's Convex suites run under
// edge-runtime, which has neither global, so this is a no-op there).
// Bun has no global storage, so under `bun run test` this is a no-op too. It
// stays for editor test runners, which start Vitest on Node.
type StorageKey = "localStorage" | "sessionStorage";

const globals = globalThis as {
	jsdom?: { window: Window };
	happyDOM?: unknown;
	Storage?: new () => Storage;
};

function pointAt(key: StorageKey, get: () => Storage) {
	Object.defineProperty(globalThis, key, { configurable: true, get });
}

if (globals.jsdom) {
	const { window } = globals.jsdom;
	for (const key of ["localStorage", "sessionStorage"] as const) {
		pointAt(key, () => window[key]);
	}
} else if (globals.happyDOM && globals.Storage) {
	// Vitest's happy-dom environment does not expose the window object, but
	// happy-dom's own Storage class is copied onto the global and can be
	// constructed directly.
	for (const key of ["localStorage", "sessionStorage"] as const) {
		const storage = new globals.Storage();
		pointAt(key, () => storage);
	}
}
