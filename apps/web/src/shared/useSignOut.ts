import { useNavigate } from "@solidjs/router";
import { ResultAsync } from "neverthrow";

import { authClient } from "../lib/auth.ts";
import { disablePush } from "../lib/push.ts";

import { endDataSession } from "./data/caches.ts";
import { setKeeperActive } from "./data/queryKeeper.ts";
import { toaster } from "./toaster.ts";

const SIGN_OUT_FAILED = "Could not sign out. Try again.";

/**
 * Sign out.
 *
 * This device's push subscription goes first, while the session still exists:
 * on a shared device the next person must not receive the previous person's
 * notifications. A failure there is logged and never blocks signing out.
 * The data session ends before the auth session does, so the unmounting
 * signed-in pages cannot refill the caches. If signing out fails and the
 * session still has its user, the keeper comes back on; with no user it
 * stays off. A failed sign-out is a toast, unless the caller has an area of
 * its own for it and passes `onError`.
 */
export function useSignOut(options?: {
	onError: (message: string) => void;
}): () => Promise<void> {
	const navigate = useNavigate();
	const session = authClient.useSession();
	return async function signOut(): Promise<void> {
		const unsubscribed = await disablePush();
		if (unsubscribed.isErr()) {
			// eslint-disable-next-line no-console -- a failed unsubscribe must not block signing out; surface it for debugging
			console.error(
				"[push] could not remove this device's subscription",
				unsubscribed.error
			);
		}
		endDataSession();
		const signedOut = await ResultAsync.fromPromise(
			authClient.signOut(),
			() => SIGN_OUT_FAILED
		);
		if (signedOut.isErr()) {
			if (session().data?.user) setKeeperActive(true);
			if (options) options.onError(signedOut.error);
			else toaster.create({ type: "error", title: signedOut.error });
			return;
		}
		navigate("/signin", { replace: true });
	};
}
