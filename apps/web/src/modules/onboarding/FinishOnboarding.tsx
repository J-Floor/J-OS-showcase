import { createSignal, onMount, Show } from "solid-js";

import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import styles from "./OnboardingWizard.module.scss";

/**
 * Shown when the wizard has no step left. Asks the server to activate the
 * person; on success the container's redirect takes over, so this keeps the
 * loading screen. Only a refusal (or an error) reaches the message.
 */
export function FinishOnboarding(props: {
	onResume: () => Promise<{ activated: boolean }>;
}) {
	const [blocked, setBlocked] = createSignal(false);
	onMount(() => {
		props.onResume().then(
			({ activated }) => {
				if (!activated) setBlocked(true);
			},
			() => setBlocked(true)
		);
	});
	return (
		<Show when={blocked()} fallback={<LoadingScreen />}>
			<section class={styles.card}>
				<header class={styles.head}>
					<h1 class={styles.title}>Almost there</h1>
				</header>
				<p class={styles.body}>
					Your setup needs one more thing from the board before you
					can get in. Please contact your host or a board member.
				</p>
			</section>
		</Show>
	);
}
