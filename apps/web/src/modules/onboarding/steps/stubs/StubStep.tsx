import { Button, EmptyState } from "@j-os/design-system";

import type { OnboardingStepProps } from "../../types.ts";

import styles from "./StubStep.module.scss";

/**
 * Placeholder for an onboarding step whose real screen ships in a later spec
 * (Document → SP-3, door access → SP-4, WiFi → SP-5). Renders a "coming soon" panel
 * with a Continue that completes the step so the full sequence walks now.
 */
export function makeStubStep(label: string) {
	return function StubStep(props: OnboardingStepProps) {
		return (
			<div class={styles.wrap}>
				<EmptyState
					icon="construction"
					title={`${label} — coming soon`}
					description="This onboarding step isn't built yet. Continue for now."
				/>
				<Button onClick={() => void props.onComplete()}>
					Continue
				</Button>
			</div>
		);
	};
}
