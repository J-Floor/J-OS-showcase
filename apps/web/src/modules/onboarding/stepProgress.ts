import { createContext, type Accessor } from "solid-js";

import type { Doc } from "../../../convex/_generated/dataModel";
import {
	firstIncompleteSelfStepId,
	requiredSelfStepIds,
} from "../../../convex/lib/onboardingSteps.ts";

/**
 * "Step N of M" for the footer, or nothing where the wizard's header shows it
 * instead. The wizard alone decides where progress renders.
 */
export const StepProgressContext =
	createContext<Accessor<string | undefined>>();

/**
 * Where the person is in their required steps. Pass an accessor, and every
 * read stays inside the returned functions, so a changed person updates them.
 */
export function createStepProgress(person: () => Doc<"people">) {
	function currentId() {
		return firstIncompleteSelfStepId(
			person().tier,
			person().onboarding?.steps ?? {}
		);
	}
	function label() {
		const ids = requiredSelfStepIds(person().tier);
		const id = currentId();
		const position = id ? ids.indexOf(id) + 1 : ids.length;
		return `Step ${position} of ${ids.length}`;
	}
	return { currentId, label };
}
