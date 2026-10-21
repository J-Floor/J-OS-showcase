import { Button, Icon, IconButton } from "@j-os/design-system";
import { createSignal, type JSX, Show } from "solid-js";

import { createDismissed } from "../../lib/dismissed.ts";
import { enablePush, pushConfigured, pushSupport } from "../../lib/push.ts";
import { createActionError } from "../createActionError.ts";
// Same pill surface as the install prompt; PromptStack places them both.
import { ICONS } from "../icons.ts";
import { InlineError } from "../InlineError.tsx";
import styles from "../InstallPwaPrompt.module.scss";

const DISMISSED_KEY = "jf-push-prompt-dismissed";

/**
 * One-time "Enable notifications" pill. The app never asks for permission on
 * its own: the browser prompt runs only from this click (iOS requires a user
 * gesture), and only while the permission is still undecided.
 */
export function NotificationsPrompt(): JSX.Element {
	const [dismissed, dismiss] = createDismissed(DISMISSED_KEY);
	const [support, setSupport] = createSignal(pushSupport());
	const { error: failure, trackResult } = createActionError();

	function show(): boolean {
		return pushConfigured() && support() === "default" && !dismissed();
	}

	// No busy flag of its own: the Button ignores clicks while the promise
	// its onClick returned is pending.
	async function enable(): Promise<void> {
		const result = await trackResult(enablePush());
		// A failure (a timeout, a flaky network) is not a refusal: keep the
		// pill so the person can try again, and say why.
		if (result.isErr()) return;
		setSupport(result.value);
		// A real refusal is final; anything else leaves the pill to retry.
		if (result.value === "denied") dismiss();
	}

	return (
		<Show when={show()}>
			<div class={styles.pill}>
				<InlineError message={failure()} />
				<Button
					class={styles.install}
					variant="tertiary"
					onClick={enable}
				>
					<Icon>{ICONS.notifications}</Icon>Enable notifications
				</Button>
				<IconButton tooltipLabel="Dismiss" onClick={dismiss}>
					{ICONS.close}
				</IconButton>
			</div>
		</Show>
	);
}
