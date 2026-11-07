import { Confetti, IconButton, useOverlayCovered } from "@j-os/design-system";
import { Show } from "solid-js";
import type { JSX } from "solid-js";

import styles from "./RowActions.module.scss";
import { runAction, useRunSpinner } from "./runAction.ts";
import { disabledReasonProps, type ActionDescriptor } from "./shortcuts.ts";

/** Trailing flex container for a row's icon-button triage actions. Pairs with
 * the Table's sticky `id: "actions"` column so the buttons stay pinned;
 * `actionsColumn` builds that column. */
export function RowActions(props: { children: JSX.Element }): JSX.Element {
	return <div class={styles.actions}>{props.children}</div>;
}

/**
 * One action as an icon button (a row's, or a card header's): its label, key,
 * whether `row` may take it, and why not. `disabledReason` overrides the
 * descriptor's own wording. A run on `row` in flight, or work the action
 * reports itself (`isBusy`), shows the spinner; the run goes through
 * `runAction`, so the key and the button share its guard.
 *
 * Under an open overlay the button names no key, so its peek chip stays
 * hidden: its keys are quiet there (`createActionKeys` reads the same
 * `useOverlayCovered`), as for `ActionGlyph`. Decided here, not in the
 * design system's `IconButton`: a topbar button's global key stays live
 * under a sheet, and its chip with it.
 */
export function RowActionButton<Row>(props: {
	action: ActionDescriptor<Row>;
	row: Row;
	disabledReason?: string;
}): JSX.Element {
	const spinner = useRunSpinner();
	const isCovered = useOverlayCovered();
	const button = (
		<IconButton
			tooltipLabel={props.action.label}
			shortcut={isCovered() ? undefined : props.action.hotkey}
			disabled={!props.action.can(props.row)}
			{...disabledReasonProps(
				props.action,
				props.row,
				props.disabledReason
			)}
			isLoading={
				spinner.isShown(props.action, props.row) ||
				props.action.isBusy?.(props.row) === true
			}
			onClick={() => void runAction(props.action, props.row)}
		>
			{props.action.icon}
		</IconButton>
	);
	return (
		<Show when={props.action.celebrate} fallback={button}>
			<Confetti>{button}</Confetti>
		</Show>
	);
}
