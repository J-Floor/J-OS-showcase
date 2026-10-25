import { Navigate } from "@solidjs/router";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { ok, type Result } from "neverthrow";
import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
	firstIncompleteSelfStepId,
	requiredSelfStepIds,
} from "../../../convex/lib/onboardingSteps.ts";
import { call, type ClientError } from "../../lib/call.ts";
import { AppErrorBoundary } from "../../shared/AppErrorBoundary.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import { FinishOnboarding } from "./FinishOnboarding.tsx";
import styles from "./OnboardingWizard.module.scss";
import { ONBOARDING_VIEWS } from "./registry.ts";

/** Presentational wizard: renders the current step for a given person. */
export function OnboardingWizardView(props: {
	person: Doc<"people">;
	onComplete: () => PromiseLike<Result<unknown, ClientError>>;
	onResume: () => PromiseLike<
		Result<FunctionReturnType<typeof api.onboarding.resume>, ClientError>
	>;
}) {
	const { error: completeError, trackResult } = createActionError();
	/** What each step's button calls; a refusal shows under the step. */
	async function complete(): Promise<void> {
		await trackResult(props.onComplete());
	}
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
		return id ? requiredSelfStepIds(tier()).indexOf(id) + 1 : total();
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
								onComplete={complete}
							/>
						</AppErrorBoundary>
						<InlineError message={completeError()} />
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

	async function complete(): Promise<Result<unknown, ClientError>> {
		const person = state.data()?.person;
		const id = person
			? firstIncompleteSelfStepId(
					person.tier,
					person.onboarding?.steps ?? {}
				)
			: undefined;
		return id
			? call(
					completeStep.mutateAsync({ stepId: id }),
					"Could not save that step."
				)
			: ok(undefined);
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
						onResume={() =>
							call(
								resume.mutateAsync({}),
								"Could not finish your setup."
							)
						}
					/>
				)}
			</Show>
		</Show>
	);
}
