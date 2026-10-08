import { Button, SearchInput } from "@j-os/design-system";
import { createSignal } from "solid-js";

import { HouseRules } from "../../../../shared/rules/HouseRules.tsx";
import {
	RULES_INTRO,
	RULES_SEARCH_LABEL,
} from "../../../../shared/rules/rulesContent.ts";
import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./RulesStep.module.scss";

/** Onboarding step B: the shared, searchable house-rule cards + a single agree action. */
export function RulesStep(props: OnboardingStepProps) {
	const [query, setQuery] = createSignal("");
	return (
		<div class={styles.wrap}>
			<SearchInput
				label=""
				aria-label={RULES_SEARCH_LABEL}
				placeholder={RULES_SEARCH_LABEL}
				value={query()}
				onValueChange={setQuery}
			/>
			<p>{RULES_INTRO}</p>
			<HouseRules query={query()} />
			<StepActions>
				<Button onClick={() => void props.onComplete()}>I agree</Button>
			</StepActions>
		</div>
	);
}
