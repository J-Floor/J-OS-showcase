import type { Component } from "solid-js";

import type { Doc } from "../../../convex/_generated/dataModel";
import type { OnboardingStepId } from "../../../convex/lib/onboardingSteps.ts";

export type OnboardingStepProps = {
	person: Doc<"people">;
	/** Marks this step complete (calls the completeStep mutation) and advances. */
	onComplete: () => Promise<void>;
};

export type OnboardingStepView = {
	id: OnboardingStepId;
	/** Wizard header / progress label. */
	title: string;
	component: Component<OnboardingStepProps>;
};
