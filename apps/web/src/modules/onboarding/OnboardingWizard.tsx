import { Logo, PHONE_QUERY, createMediaQuery } from "@j-os/design-system";
import { Navigate } from "@solidjs/router";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { ok, type Result } from "neverthrow";
import { Show, createEffect } from "solid-js";
import { Dynamic } from "solid-js/web";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { firstIncompleteSelfStepId } from "../../../convex/lib/onboardingSteps.ts";
import { call, type ClientError } from "../../lib/call.ts";
import { APP_NAME } from "../../lib/constants.ts";
import { AppErrorBoundary } from "../../shared/AppErrorBoundary.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import { FinishOnboarding } from "./FinishOnboarding.tsx";
import styles from "./OnboardingWizard.module.scss";
import { ONBOARDING_VIEWS } from "./registry.ts";
import { StepProgressContext, createStepProgress } from "./stepProgress.ts";

/**
 * The footer sticks, so a refusal can land far below the button that caused
 * it. Each attempt clears the message before it can set one again, so a repeat
 * refusal passes through null and scrolls again. Call it inside the keyed
 * block, so the effect lives and dies with the step.
 */
function scrollRefusalIntoView(message: () => string | null) {
	let element: HTMLDivElement | undefined;
	createEffect(() => {
		if (message()) {
			element?.scrollIntoView({ block: "nearest" });
		}
	});
	return (node: HTMLDivElement) => {
		element = node;
	};
}

/** Presentational wizard: renders the current step for a given person. */
export function OnboardingWizardView(props: {
	person: Doc<"people">;
	onComplete: () => PromiseLike<Result<unknown, ClientError>>;
	onResume: () => PromiseLike<
		Result<FunctionReturnType<typeof api.onboarding.resume>, ClientError>
	>;
}) {
	const { currentId, label: progress } = createStepProgress(
		() => props.person
	);
	// Keyed to the step, so a refusal never carries over to the next one.
	const { error: completeError, trackResult } = createActionError(
		() => currentId() ?? undefined
	);
	/** What each step's button calls; a refusal shows under the step. */
	async function complete(): Promise<void> {
		await trackResult(props.onComplete());
	}
	const isPhone = createMediaQuery(PHONE_QUERY);
	function footerProgress() {
		return isPhone() ? undefined : progress();
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
				const errorReference = scrollRefusalIntoView(completeError);
				return (
					<section class={`${styles.card} ${styles.stepCard}`}>
						<header class={styles.head}>
							<Show
								when={isPhone()}
								fallback={
									<Logo
										class={styles.logo}
										variant="monogram"
										title={APP_NAME}
									/>
								}
							>
								<p class={styles.progress}>{progress()}</p>
							</Show>
							<h1 class={styles.title}>{view.title}</h1>
						</header>
						<StepProgressContext.Provider value={footerProgress}>
							<AppErrorBoundary>
								<Dynamic
									component={view.component}
									person={props.person}
									onComplete={complete}
								/>
							</AppErrorBoundary>
						</StepProgressContext.Provider>
						<Show when={completeError()}>
							<div ref={errorReference}>
								<InlineError message={completeError()} />
							</div>
						</Show>
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
