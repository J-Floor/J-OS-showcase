import { Button, fireConfetti } from "@j-os/design-system";
import { onCleanup, onMount } from "solid-js";

import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./WelcomeStep.module.scss";

const CONFETTI_LEFT_DELAY_MS = 150;
const CONFETTI_RIGHT_DELAY_MS = 300;

/**
 * Onboarding step 1: a welcome screen. Bursts confetti on arrival and points the
 * new member at the short setup that follows. Info-only — Continue completes it.
 */
export function WelcomeStep(props: OnboardingStepProps) {
	onMount(() => {
		// Decorative only — never let a confetti hiccup break the step.
		try {
			fireConfetti();
			const timers = [
				setTimeout(() => {
					fireConfetti({ x: 0.3, y: 0.4 });
				}, CONFETTI_LEFT_DELAY_MS),
				setTimeout(() => {
					fireConfetti({ x: 0.7, y: 0.4 });
				}, CONFETTI_RIGHT_DELAY_MS),
			];
			onCleanup(() => {
				for (const timer of timers) clearTimeout(timer);
			});
		} catch {
			/* ignore */
		}
	});

	return (
		<div class={styles.wrap}>
			<p>These next few steps will help you get set up.</p>
			<StepActions>
				<Button onClick={() => void props.onComplete()}>
					Let's go
				</Button>
			</StepActions>
		</div>
	);
}
