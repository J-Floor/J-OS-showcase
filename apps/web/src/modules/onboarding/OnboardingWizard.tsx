import { Navigate } from "@solidjs/router";
import { useMutation, useQuery } from "convex-solidjs";
import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
	firstIncompleteSelfStepId,
	requiredSelfStepIds,
} from "../../../convex/lib/onboardingSteps.ts";
import { AppErrorBoundary } from "../../shared/AppErrorBoundary.tsx";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import { FinishOnboarding } from "./FinishOnboarding.tsx";
import styles from "./OnboardingWizard.module.scss";
import { ONBOARDING_VIEWS } from "./registry.ts";

/** Presentational wizard: renders the current step for a given person. */
export function OnboardingWizardView(props: {
	person: Doc<"people">;
	onComplete: () => Promise<void>;
	onResume: () => Promise<{ activated: boolean }>;
}) {
	function tier() {
		return props.person.tier;
	}
	function currentId() {
		return firstIncompleteSelfStepId(
			tier(),
			props.person.onboarding?.steps ?? {}
		);
	}
	function total() {
		return requiredSelfStepIds(tier()).length;
	}
	function position() {
		const id = currentId();
		if (!id) return total();
		return requiredSelfStepIds(tier()).indexOf(id) + 1;
	}
	return (
		<Show
			when={currentId()}
			keyed
			fallback={<FinishOnboarding onResume={props.onResume} />}
		>
			{(id) => {
				// `keyed`: recreate this block whenever the current step id
				// changes, so `view` (and the rendered step) actually advance
				// when a step completes. A non-keyed Show keeps the stale block
				// while `when` stays truthy, so it only updated on a full reload.
				const view = ONBOARDING_VIEWS[id];
				return (
					<section class={styles.card}>
						<header class={styles.head}>
							<p class={styles.progress}>
								Step {position()} of {total()}
							</p>
							<h1 class={styles.title}>{view.title}</h1>
						</header>
						<AppErrorBoundary>
							<Dynamic
								component={view.component}
								person={props.person}
								onComplete={props.onComplete}
							/>
						</AppErrorBoundary>
					</section>
				);
			}}
		</Show>
	);
}

/** Container: wires the wizard to Convex (current person + completeStep). */
export function OnboardingWizard() {
	const state = useQuery(api.onboarding.getState, {});
	const completeStep = useMutation(api.onboarding.completeStep);
	const resume = useMutation(api.onboarding.resume);

	async function complete() {
		const person = state.data()?.person;
		if (!person) return;
		const id = firstIncompleteSelfStepId(
			person.tier,
			person.onboarding?.steps ?? {}
		);
		if (id) await completeStep.mutateAsync({ stepId: id });
	}

	return (
		<Show when={!state.isLoading()} fallback={<LoadingScreen />}>
			<Show
				when={state.data()?.needsOnboarding && state.data()?.person}
				fallback={<Navigate href="/" />}
			>
				{(person) => (
					<OnboardingWizardView
						person={person()}
						onComplete={complete}
						onResume={() => resume.mutateAsync({})}
					/>
				)}
			</Show>
		</Show>
	);
}
