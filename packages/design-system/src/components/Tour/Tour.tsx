import {
	Tour as ArkTour,
	useTour,
	type TourStepDetails,
} from "@ark-ui/solid/tour";
import clsx from "clsx";
import { For, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { Button } from "../Button/Button.tsx";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./Tour.module.scss";

export { useTour };
export type TourStep = TourStepDetails;
export type UseTourReturn = ReturnType<typeof useTour>;

export function Tour(props: {
	tour: UseTourReturn;
	class?: string;
}): JSX.Element {
	return (
		<ArkTour.Root tour={props.tour} lazyMount unmountOnExit>
			{/*
			 * Ark keeps the positioner and content MOUNTED while the tour is
			 * closed — content carries `data-state="closed"` and nothing else,
			 * no `hidden`, no `display: none`. So an app that renders <Tour>
			 * unconditionally (which it must: the component owns the start
			 * call) had an empty 320px card, reading "0 of 4", parked at the
			 * end of the document.
			 *
			 * On desktop the shell is `100dvb; overflow: hidden` and it sat
			 * just past the fold, invisible and therefore unreported. On a
			 * phone it was reachable, and it was announced to screen readers
			 * the whole time as a modal `alertdialog` — a permanently-open
			 * empty modal is the worse half of this bug.
			 *
			 * `open` is the machine's own flag, so this closes the moment the
			 * tour dismisses or completes.
			 */}
			<Show when={props.tour().open}>
				<Portal>
					<ArkTour.Backdrop class={styles.backdrop} />
					<ArkTour.Spotlight class={styles.spotlight} />
					<ArkTour.Positioner class={styles.positioner}>
						<ArkTour.Content
							class={clsx(styles.content, props.class)}
						>
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
												<ArkTour.ActionTrigger
													action={action}
													asChild={(triggerProps) => (
														<Button
															{...(triggerProps() as object)}
															variant={
																action.action ===
																"prev"
																	? "secondary"
																	: "primary"
															}
														>
															{action.label}
														</Button>
													)}
												/>
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
