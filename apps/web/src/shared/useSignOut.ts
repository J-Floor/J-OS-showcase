import { useNavigate } from "@solidjs/router";

import { authClient } from "../lib/auth.ts";
import { disablePush } from "../lib/push.ts";

import { endDataSession } from "./data/caches.ts";
import { setKeeperActive } from "./data/queryKeeper.ts";

/**
 * Sign out.
 *
 * This device's push subscription goes first, while the session still exists:
 * on a shared device the next person must not receive the previous person's
 * notifications. A failure there is logged and never blocks signing out.
 * The data session ends before the auth session does, so the unmounting
 * signed-in pages cannot refill the caches. If signing out fails and the
 * session still has its user, the keeper comes back on; with no user it
 * stays off.
 */
export function useSignOut(): () => Promise<void> {
	const navigate = useNavigate();
	const session = authClient.useSession();
	return async function signOut(): Promise<void> {
		try {
			await disablePush();
		} catch (err) {
			// eslint-disable-next-line no-console -- a failed unsubscribe must not block signing out; surface it for debugging
			console.error(
				"[push] could not remove this device's subscription",
				err
			);
		}
		endDataSession();
		try {
			await authClient.signOut();
		} catch (err) {
			if (session().data?.user) setKeeperActive(true);
			throw err;
		}
		navigate("/signin", { replace: true });
	};
}
