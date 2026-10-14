import { IconButton } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { ActionDescriptor } from "../actions/shortcuts.ts";

import styles from "./RowActions.module.scss";

/** Trailing flex container for a row's icon-button triage actions. Pairs with
 * the Table's sticky `id: "actions"` column so the buttons stay pinned. */
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
	return (
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
}

/** One `IconButton` as the design system renders it. */
const BUTTON = 29;
/** `--jf-spacing-close`, the gap between two of them. */
const GAP = 4;
/** The cell's own inline padding, both sides together. */
const CELL_PADDING = 17;

/**
 * How wide the trailing actions column must be to hold `count` buttons.
 *
 * Derived rather than guessed, because guessing wrong is invisible until
 * somebody points at the screen. `RowActions` is `justify-content: flex-end`
 * and nothing clips it, so a column too narrow for its buttons does not cut
 * them off — the overflow escapes out the LEFT of the cell and sits on top of
 * the column before it. All three of these columns were sized before the
 * agreement button was added to them, and all three had been overflowing by
 * about a button's width ever since.
 *
 * Pass the MOST buttons any row can show, not the usual number: several are
 * conditional (a kicked-out member has no "Kick out"), and one width has to
 * serve the whole table.
 */
export function actionsColumnSize(count: number): number {
	return count * BUTTON + Math.max(0, count - 1) * GAP + CELL_PADDING;
}
