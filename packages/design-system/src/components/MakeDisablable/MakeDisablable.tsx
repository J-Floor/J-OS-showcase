import clsx from "clsx";
import { type JSX, type ParentProps, Show } from "solid-js";

import { type DisablingState } from "../../utils/disablingProps.ts";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./MakeDisablable.module.scss";

export type MakeDisablableProps = DisablingState &
	ParentProps & {
		/** Class applied to the disabled wrapper / tooltip trigger. */
		class?: string;
	};

/**
 * Wraps a disablable element to provide the disabled DIM (opacity) and, when a
 * reason is given, a disabled-reason TOOLTIP.
 *
 * Ported from EmboUI's MakeDisablable. Three branches via `<Show>`:
 *  - disabled + reason (and not omitted) → Tooltip
 *  - disabled (no reason) → bare `<span class=disabled>`
 *  - else → children unchanged
 *
 * For the tooltip branch the J-OS `Tooltip` renders its trigger as a `<button>`
 * by default; to avoid nesting interactive elements (e.g. a `<button>` inside
 * the trigger button) we use the Tooltip's `asChild` render prop to make a
 * NON-interactive `<span class=disabled>` the trigger that wraps the children.
 * `triggerTabIndex={0}` keeps disabled elements focusable for screen-readers.
 */
export function MakeDisablable(props: MakeDisablableProps): JSX.Element {
	return (
		<Show
			when={
				props.disabled &&
				!props.shamefullyOmitDisabledReason &&
				Boolean(props.disabledReason)
			}
			fallback={
				<Show when={props.disabled} fallback={props.children}>
					<span class={clsx(props.class, styles.disabled)}>
						{props.children}
					</span>
				</Show>
			}
		>
			<Tooltip
				tooltipContent={props.disabledReason}
				triggerTabIndex={0}
				ids={
					props.disabledReasonTooltipId
						? { trigger: props.disabledReasonTooltipId }
						: undefined
				}
				asChild={(triggerProps) => (
					<span
						{...triggerProps()}
						class={clsx(props.class, styles.disabled)}
					>
						{props.children}
					</span>
				)}
			/>
		</Show>
	);
}
