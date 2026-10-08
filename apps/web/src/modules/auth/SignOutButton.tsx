import { IconButton } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import type { JSX } from "solid-js";

import { authClient } from "../../lib/auth.ts";
import { disablePush } from "../../lib/push.ts";
import { type ConfirmOptions, useConfirm } from "../../shared/confirm.tsx";
import { ICONS } from "../../shared/icons.ts";

const SIGN_OUT_CONFIRM: ConfirmOptions = {
	title: "Sign out?",
	message: "You'll need a new sign-in link from your email to get back in.",
	confirmLabel: "Sign out",
};

/**
 * Sign out.
 *
 * This device's push subscription goes first, while the session still exists:
 * on a shared device the next person must not receive the previous person's
 * notifications. A failure there is logged and never blocks signing out.
 */
function useSignOut(): () => Promise<void> {
	const navigate = useNavigate();
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
		await authClient.signOut();
		navigate("/signin", { replace: true });
	};
}

/**
 * Sign out after a yes in the shared confirm dialog, which the app shell
 * mounts. Getting back in takes a fresh link from email, so a stray click on a
 * small icon must not cost that. Shared by the topbar's icon button and the
 * folded topbar menu (TopbarMenu), so both ask the same question.
 */
export function useConfirmedSignOut(): () => Promise<void> {
	const confirm = useConfirm();
	const signOut = useSignOut();
	return async function confirmedSignOut(): Promise<void> {
		if (await confirm(SIGN_OUT_CONFIRM)) await signOut();
	};
}

/** The topbar's sign-out control. When the bar folds its actions into one
 *  menu, sign-out moves into that menu (TopbarMenu). */
export function SignOutButton(): JSX.Element {
	const signOut = useConfirmedSignOut();
	return (
		<IconButton tooltipLabel="Sign out" onClick={() => void signOut()}>
			{ICONS.signOut}
		</IconButton>
	);
}
