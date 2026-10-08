import { Button, Icon, IconButton } from "@j-os/design-system";
import { createSignal, type JSX, Show } from "solid-js";

import { createDismissed } from "../../lib/dismissed.ts";
import { enablePush, pushConfigured, pushSupport } from "../../lib/push.ts";
// Same pill surface as the install prompt; PromptStack places them both.
import { ICONS } from "../icons.ts";
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
	const [busy, setBusy] = createSignal(false);

	function show(): boolean {
		return pushConfigured() && support() === "default" && !dismissed();
	}

	async function enable(): Promise<void> {
		if (busy()) return;
		setBusy(true);
		try {
			const next = await enablePush();
			setSupport(next);
			// A real refusal is final; anything else leaves the pill to retry.
			if (next === "denied") dismiss();
		} catch (err) {
			// A thrown error (a timeout, a flaky network) is not a refusal: keep
			// the pill so the person can try again.
			// eslint-disable-next-line no-console -- surface a failed subscribe; the pill stays for a retry
			console.error("[push] could not enable notifications", err);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Show when={show()}>
			<div class={styles.pill}>
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
