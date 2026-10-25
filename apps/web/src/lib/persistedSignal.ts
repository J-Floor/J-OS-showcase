import { readStored, writeStored } from "@j-os/design-system";
import { createEffect, createSignal, type Signal } from "solid-js";

/**
 * A string signal whose value is mirrored to `localStorage` under `key`, so it
 * survives reloads. Reads the stored value on creation (falling back to
 * `initial`) and writes back whenever it changes. A disabled or full store
 * never breaks the UI: the value just doesn't persist.
 */
export function createPersistedSignal(
	key: string,
	initial: string
): Signal<string> {
	const [value, setValue] = createSignal(
		readStored("local", key).unwrapOr(null) ?? initial
	);
	createEffect(() => {
		writeStored("local", key, value()).unwrapOr(undefined);
	});
	return [value, setValue];
}
