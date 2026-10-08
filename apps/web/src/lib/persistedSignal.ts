import { createEffect, createSignal, type Signal } from "solid-js";

/** Read a key from localStorage, tolerating a disabled/unavailable store. */
function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/**
 * A string signal whose value is mirrored to `localStorage` under `key`, so it
 * survives reloads. Reads the stored value on creation (falling back to
 * `initial`) and writes back whenever it changes. Storage access is wrapped in
 * try/catch so a disabled/full store never breaks the UI.
 */
export function createPersistedSignal(
	key: string,
	initial: string
): Signal<string> {
	const [value, setValue] = createSignal(readStored(key) ?? initial);
	createEffect(() => {
		try {
			localStorage.setItem(key, value());
		} catch {
			// ignore: storage unavailable (private mode / quota)
		}
	});
	return [value, setValue];
}
