/**
 * Web storage that never throws. Where site data is blocked, merely reading
 * `localStorage` or `sessionStorage` throws (a `SecurityError`), and a full
 * store throws on write. Each call returns a `Result` instead, so the caller
 * decides what an unusable store means: usually nothing (a preference that
 * does not persist), sometimes a guard that must not run without it. Values
 * are stored as the raw strings given.
 */
import { Result } from "neverthrow";

/** Which store: the browser's (`localStorage`) or the tab's
 *  (`sessionStorage`). Named, not passed, because reading the store itself
 *  is what throws. */
export type StorageArea = "local" | "session";

/** The `Err` of every call: the store is blocked or full. */
export const STORAGE_UNAVAILABLE = "storage unavailable";

export type StorageUnavailable = typeof STORAGE_UNAVAILABLE;

function storeOf(area: StorageArea): Storage {
	return area === "local" ? localStorage : sessionStorage;
}

const getItem = Result.fromThrowable(
	(area: StorageArea, key: string) => storeOf(area).getItem(key),
	(): StorageUnavailable => STORAGE_UNAVAILABLE
);

const setItem = Result.fromThrowable(
	(area: StorageArea, key: string, value: string) => {
		storeOf(area).setItem(key, value);
	},
	(): StorageUnavailable => STORAGE_UNAVAILABLE
);

/** The stored string (`null` when absent); `Err` when the store is
 *  unusable. */
export function readStored(
	area: StorageArea,
	key: string
): Result<string | null, StorageUnavailable> {
	return getItem(area, key);
}

/** Stores `value`; `Err` when the store is blocked or full. */
export function writeStored(
	area: StorageArea,
	key: string,
	value: string
): Result<void, StorageUnavailable> {
	return setItem(area, key, value);
}
