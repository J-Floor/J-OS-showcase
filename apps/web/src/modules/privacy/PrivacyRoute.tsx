import { Navigate } from "@solidjs/router";
import { useQuery } from "convex-solidjs";
import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { authClient } from "../../lib/auth.ts";
import { ottPending } from "../../lib/convex.ts";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import { PrivacyPolicy } from "./PrivacyPolicy.tsx";

// The members' privacy policy is not public — it's gated to people with a real
// J floor relationship (board/member/guest, including those mid-onboarding).
// The public landing-page policy, if any, lives elsewhere.
// Staff sign in and hold a profile, so they may read it too. `core` is
// deliberately NOT here: it never was, and widening /privacy to core members
// is a separate decision for the board to take.
const ALLOWED = new Set(["board", "admin", "member", "guest", "staff"]);

/** Gated, full-screen `/privacy` host. Requires a session and an allowed person
 *  type; signed-out users go to /signin, others back to the app. */
export function PrivacyRoute() {
	const session = authClient.useSession();
	const state = useQuery(api.onboarding.getState, {});

	function allowed(): boolean {
		const data = state.data();
		if (!data?.person) return false;
		// Anyone mid-onboarding plus settled members and the board.
		// `needsOnboarding` covers the onboarding window directly.
		return data.needsOnboarding || ALLOWED.has(data.person.tier);
	}

	return (
		<Show
			when={!session().isPending && !ottPending()}
			fallback={<LoadingScreen />}
		>
			<Show when={session().data} fallback={<Navigate href="/signin" />}>
				{/* Gate on data presence, not `!isLoading()`: convex-solidjs
				    returns undefined with isLoading=false on the first render
				    (before the live subscription pushes), which would fire the
				    not-allowed redirect prematurely. */}
				<Show
					when={state.data() !== undefined}
					fallback={<LoadingScreen />}
				>
					<Show when={allowed()} fallback={<Navigate href="/" />}>
						<PrivacyPolicy />
					</Show>
				</Show>
			</Show>
		</Show>
	);
}
