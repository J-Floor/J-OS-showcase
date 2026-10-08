import type { Hotkey, Modifier } from "@tanstack/solid-hotkeys";
import clsx from "clsx";
import { type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { IconButton, type IconButtonProps } from "../IconButton/IconButton.tsx";

import styles from "./SwapIconButton.module.scss";

export type SwapIconButtonProps = {
	/** Accessible label / tooltip. */
	tooltipLabel: string;
	/** Material Symbols ligature shown at rest. */
	idleIcon: string;
	/** Ligature shown while `success` is true. @default "check" */
	successIcon?: string;
	/** Controlled success state — swaps to `successIcon` + pops. */
	success: boolean;
	/** Key that fires this button, shown as a chip in its tooltip / peek badge.
	 *  Forwarded to the underlying {@link IconButton}; binding it stays the
	 *  caller's job. */
	shortcut?: Hotkey | Modifier;
	isLoading?: boolean;
	onClick?: IconButtonProps["onClick"];
	class?: string;
};

/**
 * Icon button that swaps to a success glyph (a check by default) while
 * `success` is true — the reusable "copied!/done!" feedback control. The caller
 * owns the `success` flag (e.g. a transient flag that auto-reverts). Wrap in
 * {@link Confetti} if you also want a burst.
 */
export function SwapIconButton(props: SwapIconButtonProps): JSX.Element {
	return (
		<IconButton
			tooltipLabel={props.tooltipLabel}
			shortcut={props.shortcut}
			isLoading={props.isLoading}
			onClick={props.onClick}
			class={clsx(props.success && styles.success, props.class)}
		>
			{props.success
				? (props.successIcon ?? ICONS.check)
				: props.idleIcon}
		</IconButton>
	);
}
