import { Confetti, IconButton } from "@j-os/design-system";
import { Show } from "solid-js";
import type { JSX } from "solid-js";

import type { ActionDescriptor } from "../actions/shortcuts.ts";

import styles from "./RowActions.module.scss";

/** Trailing flex container for a row's icon-button triage actions. Pairs with
 * the Table's sticky `id: "actions"` column so the buttons stay pinned; size
 * that column with the design system's `actionsColumnSize`. */
export function RowActions(props: { children: JSX.Element }): JSX.Element {
	return <div class={styles.actions}>{props.children}</div>;
}

/**
 * One row action as an icon button: its label, key, whether `row` may take it,
 * and why not. `disabledReason` overrides the descriptor's own wording.
 */
export function RowActionButton<Row>(props: {
	action: ActionDescriptor<Row>;
	row: Row;
	disabledReason?: string;
}): JSX.Element {
	const button = (
		<IconButton
			tooltipLabel={props.action.label}
			shortcut={props.action.hotkey}
			disabled={!props.action.can(props.row)}
			// The union behind `disabled` demands a reason whenever the button
			// can be disabled at all, so this cannot be optional. The fallback is
			// unreachable for an action whose `can` is always true — never
			// disabled, so its reason is never shown.
			disabledReason={
				props.disabledReason ??
				props.action.disabledReason?.(props.row) ??
				props.action.label
			}
			onClick={() => void props.action.run(props.row)}
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
