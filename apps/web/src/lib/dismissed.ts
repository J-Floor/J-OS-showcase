import { createSignal } from "solid-js";

/**
 * A one-way "dismissed" flag mirrored to `localStorage` under `key`. Reads and
 * writes tolerate a blocked store: it then re-appears next load, which is
 * acceptable.
 */
export function createDismissed(key: string): [() => boolean, () => void] {
	const [dismissed, setDismissed] = createSignal(read(key));
	return [
		dismissed,
		() => {
			setDismissed(true);
			try {
				localStorage.setItem(key, "1");
			} catch {
				// Storage blocked.
			}
		},
	];
}

function read(key: string): boolean {
	try {
		return localStorage.getItem(key) === "1";
	} catch {
		return false;
	}
}
