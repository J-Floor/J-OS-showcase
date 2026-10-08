import { Button } from "@j-os/design-system";

import type { OnboardingStepProps } from "../../types.ts";

import styles from "./WifiStep.module.scss";

/**
 * Onboarding step D: WiFi. The browser can't detect whether the space's networks
 * are in range, and a WiFi QR only connects when you're on-site (it can't be
 * saved for later) — so onboarding, often done remotely, just points to the Space
 * page, where the credentials live for when you're physically there.
 */
export function WifiStep(props: OnboardingStepProps) {
	return (
		<div class={styles.wrap}>
			<p>
				WiFi access lives on your Space page. Open it once you're
				physically at the space to connect.
			</p>
			<Button onClick={() => void props.onComplete()}>Continue</Button>
		</div>
	);
}
