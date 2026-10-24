import clsx from "clsx";
import { type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { IconButton, type IconButtonProps } from "../IconButton/IconButton.tsx";

import styles from "./SwapIconButton.module.scss";

export type SwapIconButtonProps = Pick<
	IconButtonProps,
	"tooltipLabel" | "shortcut" | "isLoading" | "onClick" | "class"
> & {
	/** Material Symbols ligature shown at rest. */
	idleIcon: IconButtonProps["children"];
	/** Ligature shown while `success` is true. @default "check" */
	successIcon?: IconButtonProps["children"];
	/** Controlled success state — swaps to `successIcon` + pops. */
	success: boolean;
};

/**
 * Icon button that swaps to a success glyph (a check by default) while
 * `success` is true — the reusable "copied!/done!" feedback control. The caller
 * owns the `success` flag (e.g. a transient flag that auto-reverts). Wrap in
 * {@link Confetti} if you also want a burst. `shortcut` is only the hint;
 * binding the key stays the caller's job.
 */
export function SwapIconButton(props: SwapIconButtonProps): JSX.Element {
	return (
		<IconButton
			tooltipLabel={props.tooltipLabel}
			shortcut={props.shortcut}
			isLoading={props.isLoading}
			onClick={props.onClick}
			class={clsx(styles.swapIconButton, props.class)}
			data-success={props.success ? "" : undefined}
		>
			{props.success
				? (props.successIcon ?? ICONS.check)
				: props.idleIcon}
		</IconButton>
	);
}
