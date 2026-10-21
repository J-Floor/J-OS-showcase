import { createSignal } from "solid-js";

import { readLocal, writeLocal } from "./browserStorage.ts";

/**
 * A one-way "dismissed" flag mirrored to `localStorage` under `key`. Reads and
 * writes tolerate a blocked store: it then re-appears next load, which is
 * acceptable.
 */
export function createDismissed(key: string): [() => boolean, () => void] {
	const [dismissed, setDismissed] = createSignal(
		readLocal(key)
			.map((stored) => stored === "1")
			.unwrapOr(false)
	);
	return [
		dismissed,
		() => {
			setDismissed(true);
			writeLocal(key, "1").unwrapOr(undefined);
		},
	];
}
