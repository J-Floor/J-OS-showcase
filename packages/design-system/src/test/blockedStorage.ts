/**
 * Blocked site data, as a test double: where it is blocked, merely reading
 * `localStorage` (or `sessionStorage`) throws a `SecurityError`. Not
 * exported from the package.
 */

/** Makes reading `globalThis[store]` throw; returns the undo. */
export function blockStorage(
	store: "localStorage" | "sessionStorage" = "localStorage"
): () => void {
	const original = Object.getOwnPropertyDescriptor(globalThis, store);
	Object.defineProperty(globalThis, store, {
		configurable: true,
		get() {
			throw new DOMException(
				"The operation is insecure.",
				"SecurityError"
			);
		},
	});
	return () => {
		if (original) Object.defineProperty(globalThis, store, original);
		else Reflect.deleteProperty(globalThis, store);
	};
}
