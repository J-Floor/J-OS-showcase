import { useCurrentMatches, useSearchParams } from "@solidjs/router";
import { createEffect, type JSX, onMount } from "solid-js";

import { resyncPush } from "../../lib/push.ts";

import { NotificationsSheet } from "./NotificationsSheet.tsx";
import {
	isNotificationsOpen,
	notificationsTab,
	openNotifications,
	setNotificationsOpen,
} from "./notificationsState.ts";

/** The query param every notification email's "Manage notifications" link
 *  carries (`convex/emails/urls.ts#manageNotificationsUrl`). */
const PARAM = "notifications";

/**
 * Mounted once in the shell. Opens the sheet from the deep link (then strips
 * the param, so a reload or a shared URL does not reopen it), and re-syncs
 * this device's push subscription on app start: push services rotate
 * endpoints, and this never prompts.
 */
export function NotificationsHost(): JSX.Element {
	const [params, setParams] = useSearchParams();
	const matches = useCurrentMatches();
	createEffect(() => {
		if (params[PARAM] !== "open") return;
		openNotifications({ tab: "categories" });
		// A redirect route (`/` and unknown URLs, see LandingRedirect) has no
		// title. Stripping the param while it is still redirecting replaces its
		// navigation, so the user is stranded on the redirect. Wait until a real
		// page is matched; the redirect carries the query there. A bare
		// `pathname === "/"` check misses the `*` route, which redirects too.
		// A titleless non-redirect route keeps the param in the URL (harmless).
		if (!matches().some((match) => match.route.info?.title)) return;
		setParams({ [PARAM]: undefined }, { replace: true });
	});
	onMount(() => {
		void resyncPush().then((result) => {
			if (result.isErr())
				// eslint-disable-next-line no-console -- a failed background re-sync must not break the shell; surface it for debugging
				console.error(
					"[push] could not re-sync this device",
					result.error
				);
		});
	});
	return (
		<NotificationsSheet
			open={isNotificationsOpen()}
			tab={notificationsTab()}
			onOpenChange={setNotificationsOpen}
		/>
	);
}
