import { Button, Tooltip, type ButtonProps } from "@j-os/design-system";
import { Show, splitProps, type JSX } from "solid-js";

import { ActionGlyph } from "./ActionGlyph.tsx";
import { runAction, useRunSpinner } from "./runAction.ts";
import {
	disabledReasonProps,
	type ActionDescriptor,
	type ActionOutcome,
} from "./shortcuts.ts";

/**
 * A button fed by an action descriptor: its label, its key (named, and shown
 * as a chip in the icon's place while peeking), whether `target` may take it
 * and why not. A run in flight shows the spinner (once its confirm is
 * answered, `useRunSpinner`) and swallows a second press (`runAction`),
 * whether it came from the button or the key; work the action reports
 * itself (`isBusy`) shows the spinner too.
 *
 * With `compactLabel` (a count, on a bar with no room for the label) the
 * button shows that instead; the label stays its accessible name and is
 * its tooltip, which a disabled button trades for its reason.
 */
export function ActionButton<Target>(props: {
	action: ActionDescriptor<Target>;
	target: Target;
	variant?: "primary" | "secondary" | "tertiary";
	/** On the button's content, for a bar that lays its buttons out. */
	contentClass?: string;
	/** Shown in the label's place; the label names the button. */
	compactLabel?: string;
	/** How a run the button started ended (a selection bar clears its
	 *  rows once their batch went through). */
	onSettled?: (outcome: ActionOutcome) => void;
}): JSX.Element {
	const spinner = useRunSpinner();
	function button(triggerProps?: ButtonProps["triggerProps"]): JSX.Element {
		return (
			<Button
				variant={props.variant}
				classOverride={{ contentClass: props.contentClass }}
				triggerProps={triggerProps}
				aria-label={
					props.compactLabel === undefined
						? undefined
						: props.action.label
				}
				shortcut={props.action.hotkey}
				disabled={!props.action.can(props.target)}
				{...disabledReasonProps(props.action, props.target)}
				isLoading={
					spinner.isShown(props.action, props.target) ||
					props.action.isBusy?.(props.target) === true
				}
				onClick={() => {
					void runAction(props.action, props.target).then(
						props.onSettled
					);
				}}
			>
				<ActionGlyph
					icon={props.action.icon}
					hotkey={props.action.hotkey}
				/>
				{props.compactLabel ?? props.action.label}
			</Button>
		);
	}
	// The label already names the button: describing it by the same text
	// would have it read twice. A disabled button shows only its reason.
	return (
		<Show when={props.compactLabel !== undefined} fallback={button()}>
			<Tooltip
				tooltipContent={props.action.label}
				disabled={!props.action.can(props.target)}
				asChild={(tooltipProps) =>
					button(splitProps(tooltipProps(), ["aria-describedby"])[1])
				}
			/>
		</Show>
	);
}
