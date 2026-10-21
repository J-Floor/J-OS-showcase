import { Result } from "neverthrow";

const STORAGE_UNAVAILABLE = "storage unavailable";

/** A stored string (or `null` when absent). `Err` when the store is blocked
 *  (private mode, blocked site data). */
export const readLocal = Result.fromThrowable(
	(key: string) => localStorage.getItem(key),
	() => STORAGE_UNAVAILABLE
);

/** Store a string. `Err` when the store is blocked or full. */
export const writeLocal = Result.fromThrowable(
	(key: string, value: string) => {
		localStorage.setItem(key, value);
	},
	() => STORAGE_UNAVAILABLE
);

/** As {@link readLocal}, for the tab's session store. */
export const readSession = Result.fromThrowable(
	(key: string) => sessionStorage.getItem(key),
	() => STORAGE_UNAVAILABLE
);

/** As {@link writeLocal}, for the tab's session store. */
export const writeSession = Result.fromThrowable(
	(key: string, value: string) => {
		sessionStorage.setItem(key, value);
	},
	() => STORAGE_UNAVAILABLE
);
