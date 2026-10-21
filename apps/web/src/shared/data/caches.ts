import { releaseAll, setKeeperActive } from "./queryKeeper.ts";

/** Forget every kept query. Sign-out does not reload the page, so the next
 *  person on a shared device must not see the last person's data from
 *  memory. */
export function clearDataCaches(): void {
	releaseAll();
}

/** The session is over: switch the keeper off, which drops what it holds, so
 *  unmounting signed-in pages cannot refill it. */
export function endDataSession(): void {
	setKeeperActive(false);
}
