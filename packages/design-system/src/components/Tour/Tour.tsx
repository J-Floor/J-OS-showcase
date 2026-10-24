import {
	Tour as ArkTour,
	useTour,
	type TourStepDetails,
} from "@ark-ui/solid/tour";
import { createEffect, For, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { Button } from "../Button/Button.tsx";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./Tour.module.scss";

export { useTour };
export type TourStep = TourStepDetails;
export type UseTourReturn = ReturnType<typeof useTour>;

export type TourProps = {
	tour: UseTourReturn;
} & WithPartClasses<"backdrop" | "spotlight" | "positioner" | "content">;

/**
 * Hands focus back to wherever it was before the tour started.
 *
 * zag's tour traps focus between the step and its target, but deactivates the
 * trap without returning focus, so when the tour ends focus is left on a node
 * that has just been removed and the page falls back to `<body>`. Reading
 * `document.activeElement` at the moment the tour opens races the trap, so
 * the element is recorded from `focusin` while the tour is closed instead.
 */
function returnFocusOnEnd(isOpen: () => boolean): void {
	let returnTo: HTMLElement | null = null;
	let wasOpen = false;
	function remember(event: FocusEvent): void {
		if (event.target instanceof HTMLElement) returnTo = event.target;
	}
	createEffect(() => {
		if (isOpen()) {
			wasOpen = true;
			return;
		}
		if (wasOpen) {
			wasOpen = false;
			returnTo?.focus({ preventScroll: true });
		}
		document.addEventListener("focusin", remember);
		onCleanup(() => {
			document.removeEventListener("focusin", remember);
		});
	});
}

/** One step action as a button, named by its visible label. */
function ActionButton(props: {
	action: ArkTour.ActionTriggerProps["action"];
}): JSX.Element {
	return (
		<ArkTour.ActionTrigger
			action={props.action}
			asChild={(triggerProps) => (
				<Button
					triggerProps={triggerProps()}
					variant={
						props.action.action === "prev" ? "secondary" : "primary"
					}
					// Ark names the button after the action it runs ("next
					// step"); the visible label must be its name.
					aria-label={props.action.label}
				>
					{props.action.label}
				</Button>
			)}
		/>
	);
}

export function Tour(props: TourProps): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- an accessor, read inside the helper's effect
	returnFocusOnEnd(() => props.tour().open);
	return (
		<ArkTour.Root tour={props.tour}>
			{/*
			 * Ark keeps the positioner and content MOUNTED while the tour is
			 * closed — content carries `data-state="closed"` and nothing else,
			 * no `hidden`, no `display: none`. So an app that renders <Tour>
			 * unconditionally (which it must: the component owns the start
			 * call) had an empty card, reading "0 of 4", parked at the end of
			 * the document, and announced to screen readers the whole time as a
			 * modal `alertdialog`.
			 *
			 * `open` is the machine's own flag, so this closes the moment the
			 * tour dismisses or completes. Nothing here animates its close, so
			 * the gate cuts no transition.
			 */}
			<Show when={props.tour().open}>
				<Portal>
					<ArkTour.Backdrop
						class={getPartStyles(styles, props, "backdrop")}
					/>
					<ArkTour.Spotlight
						class={getPartStyles(styles, props, "spotlight")}
					/>
					<ArkTour.Positioner
						class={getPartStyles(styles, props, "positioner")}
					>
						<ArkTour.Content
							class={getPartStyles(styles, props, "content")}
						>
							{/* Points an anchored step at its target. Ark paints
							    the tip from the custom properties `.arrow` sets. */}
							<ArkTour.Arrow class={styles.arrow}>
								<ArkTour.ArrowTip />
							</ArkTour.Arrow>
							<ArkTour.CloseTrigger class={styles.close}>
								<Icon>{ICONS.close}</Icon>
							</ArkTour.CloseTrigger>
							<ArkTour.ProgressText class={styles.progress} />
							<ArkTour.Title class={styles.title} />
							<ArkTour.Description class={styles.description} />
							<ArkTour.Control class={styles.control}>
								<ArkTour.Actions>
									{(actions) => (
										<For each={actions()}>
											{(action) => (
												<ActionButton action={action} />
											)}
										</For>
									)}
								</ArkTour.Actions>
							</ArkTour.Control>
						</ArkTour.Content>
					</ArkTour.Positioner>
				</Portal>
			</Show>
		</ArkTour.Root>
	);
}
