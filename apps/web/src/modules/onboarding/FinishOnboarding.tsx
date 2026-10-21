import type { Result } from "neverthrow";
import { createSignal, onMount, Show } from "solid-js";

import type { ClientError } from "../../lib/call.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import styles from "./OnboardingWizard.module.scss";

/**
 * Shown when the wizard has no step left. Asks the server to activate the
 * person; on success the container's redirect takes over, so this keeps the
 * loading screen. Only a refusal (or an error) reaches the message.
 */
export function FinishOnboarding(props: {
	onResume: () => PromiseLike<Result<{ activated: boolean }, ClientError>>;
}) {
	const [blocked, setBlocked] = createSignal(false);
	const { error, trackResult } = createActionError();
	onMount(() => {
		void (async () => {
			const result = await trackResult(props.onResume());
			if (result.isErr()) {
				setBlocked(true);
				return;
			}
			if (!result.value.activated) setBlocked(true);
		})();
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
				<InlineError message={error()} />
			</section>
		</Show>
	);
}
