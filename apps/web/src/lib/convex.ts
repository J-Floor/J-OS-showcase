import { ConvexClient } from "convex/browser";
import { createEffect, createSignal, onMount } from "solid-js";

import { authClient } from "./auth.ts";

export const convex = new ConvexClient(
	import.meta.env.VITE_CONVEX_URL as string
);

// True while a cross-domain magic-link one-time token is being exchanged for a
// session. Initialised SYNCHRONOUSLY from the URL so the route gate treats the
// very first render of `/?ott=...` as loading — otherwise RoleGate's first
// `/get-session` resolves to null (the cookie isn't stored yet) and it redirects
// to /signin before the async exchange below can complete.
const [ottPending, setOttPending] = createSignal(
	typeof window !== "undefined" &&
		new URL(window.location.href).searchParams.has("ott")
);
export { ottPending };

// Cross-domain one-time-token exchange after the magic-link redirect.
// Mirrors @convex-dev/better-auth's React provider (which Solid lacks):
// the verify endpoint redirects to `/?ott=...`; we exchange it for a session.
async function consumeOneTimeToken() {
	const url = new URL(window.location.href);
	const token = url.searchParams.get("ott");
	if (!token) {
		setOttPending(false);
		return;
	}
	url.searchParams.delete("ott");
	window.history.replaceState({}, "", url);
	try {
		const result = await authClient.crossDomain.oneTimeToken.verify({
			token,
		});
		const session = result.data?.session;
		if (session) {
			await authClient.getSession({
				fetchOptions: {
					headers: { Authorization: `Bearer ${session.token}` },
				},
			});
			void authClient.updateSession();
		}
	} finally {
		setOttPending(false);
	}
}

// Bridge the Better Auth session token into the Convex client.
// Mirrors @convex-dev/better-auth's React provider (authClient.convex.token()).
export function bindConvexAuth() {
	onMount(() => {
		void consumeOneTimeToken();
	});
	const session = authClient.useSession();
	createEffect(() => {
		// re-run whenever the session identity changes
		void session().data;
		convex.setAuth(async () => {
			const { data } = await authClient.convex.token({
				fetchOptions: { throw: false },
			});
			return data?.token ?? null;
		});
	});
}
