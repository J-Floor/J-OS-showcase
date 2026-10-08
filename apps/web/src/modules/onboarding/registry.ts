import {
	SELF_STEP_IDS,
	type OnboardingStepId,
} from "../../../convex/lib/onboardingSteps.ts";

import { DocumentStep } from "./steps/document/DocumentStep.tsx";
import { RulesStep } from "./steps/rules/RulesStep.tsx";
// import { WifiStep } from "./steps/wifi/WifiStep.tsx";
import { VisitStep } from "./steps/visit/VisitStep.tsx";
import { WelcomeStep } from "./steps/welcome/WelcomeStep.tsx";
import type { OnboardingStepView } from "./types.ts";

// Every step starts as a stub; Tasks 4/5 (and later SP-3/4/5) swap in the real
// component for an id without touching the wizard or the shared id module.
export const ONBOARDING_VIEWS: Record<OnboardingStepId, OnboardingStepView> = {
	welcome: {
		id: "welcome",
		title: "Welcome to J floor",
		component: WelcomeStep,
	},
	document: {
		id: "document",
		title: "Sign the agreement",
		component: DocumentStep,
	},
	rules: {
		id: "rules",
		title: "House rules",
		component: RulesStep,
	},
	// wifi: { id: "wifi", title: "WiFi", component: WifiStep },
	visit: {
		id: "visit",
		title: "Come to build",
		component: VisitStep,
	},
};

export function orderedViews(): OnboardingStepView[] {
	return SELF_STEP_IDS.map((id) => ONBOARDING_VIEWS[id]);
}
