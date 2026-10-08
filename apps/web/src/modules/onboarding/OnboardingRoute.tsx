import { Navigate } from "@solidjs/router";
import { Show } from "solid-js";

import { authClient } from "../../lib/auth.ts";
import { ottPending } from "../../lib/convex.ts";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import styles from "./OnboardingRoute.module.scss";
import { OnboardingWizard } from "./OnboardingWizard.tsx";

/**
 * Full-screen `/onboarding` host (no AdminShell): requires a session, then
 * hands off to the wizard, which itself redirects out when onboarding isn't
 * needed. Signed-out users go to /signin.
 */
export function OnboardingRoute() {
	const session = authClient.useSession();
	return (
		<main class={styles.main}>
			<Show
				when={!session().isPending && !ottPending()}
				fallback={<LoadingScreen />}
			>
				<Show
					when={session().data}
					fallback={<Navigate href="/signin" />}
				>
					<OnboardingWizard />
				</Show>
			</Show>
		</main>
	);
}
