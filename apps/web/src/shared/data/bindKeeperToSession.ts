import { createEffect, createMemo, on } from "solid-js";

import type { authClient } from "../../lib/auth.ts";

import { clearDataCaches, endDataSession } from "./caches.ts";
import { setKeeperActive } from "./queryKeeper.ts";

type SessionAccessor = ReturnType<typeof authClient.useSession>;

/**
 * Ties the in-memory caches to the signed-in identity. It follows the user's
 * id, not every session emission: during sign-out the old session is
 * re-emitted while refetching, and that must not switch the keeper back on.
 * Every change of id starts from empty caches, so a new person (even one
 * signing in without a signed-out moment between) never reads the last one's.
 */
export function bindKeeperToSession(session: SessionAccessor): void {
	const userId = createMemo(() => session().data?.user.id);
	createEffect(
		on(userId, (id) => {
			if (id === undefined) {
				endDataSession();
				return;
			}
			clearDataCaches();
			setKeeperActive(true);
		})
	);
}
