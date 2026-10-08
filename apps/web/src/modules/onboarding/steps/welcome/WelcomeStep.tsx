import { Button, fireConfetti } from "@j-os/design-system";
import { onCleanup, onMount } from "solid-js";

import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./WelcomeStep.module.scss";

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
				}, 150),
				setTimeout(() => {
					fireConfetti({ x: 0.7, y: 0.4 });
				}, 300),
			];
			onCleanup(() => {
				timers.forEach(clearTimeout);
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
