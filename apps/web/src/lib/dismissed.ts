import { readStored, writeStored } from "@j-os/design-system";
import { createSignal } from "solid-js";

/**
 * A one-way "dismissed" flag mirrored to `localStorage` under `key`. Reads and
 * writes tolerate a blocked store: it then re-appears next load, which is
 * acceptable.
 */
export function createDismissed(key: string): [() => boolean, () => void] {
	const [dismissed, setDismissed] = createSignal(
		readStored("local", key)
			.map((stored) => stored === "1")
			.unwrapOr(false)
	);
	return [
		dismissed,
		() => {
			setDismissed(true);
			writeStored("local", key, "1").unwrapOr(undefined);
		},
	];
}
