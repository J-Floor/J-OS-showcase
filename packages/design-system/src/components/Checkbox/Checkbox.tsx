import {
	Checkbox as ArkCheckbox,
	type CheckboxRootProps,
} from "@ark-ui/solid/checkbox";
import { type JSX, Show, splitProps } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Icon } from "../Icon/Icon.tsx";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Checkbox.module.scss";

export type CheckboxProps = {
	/** Optional label rendered next to the control. */
	children?: JSX.Element;
	/**
	 * Reason the checkbox is disabled. When set together with `disabled`, it is
	 * shown in a Tooltip so screen-reader and mouse users learn why.
	 */
	disabledReason?: string;
	/** Class applied to the Root element. */
	class?: string;
} & Omit<CheckboxRootProps, "class" | "children">;

/**
 * Tri-state checkbox wrapping `@ark-ui/solid` Checkbox
 * (`Root`/`Control`/`Indicator`/`HiddenInput`).
 *
 * Ported from EmboUI's Checkbox. React→Solid: no `forwardRef`; `useState`-free;
 * `clsx` replaced by a plain class join; the EmboUI `MakeDisablable` wrapper is
 * inlined as a `disabledReason` Tooltip (wrapping a non-interactive `<span>` so
 * the Root `<label>` is never nested inside the Tooltip trigger `<button>`).
 */
export function Checkbox(props: CheckboxProps): JSX.Element {
	const [, rootProps] = splitProps(props, [
		"children",
		"disabledReason",
		"class",
	]);

	return (
		<MakeDisablable
			disabled={props.disabled}
			disabledReason={props.disabledReason}
		>
			<ArkCheckbox.Root
				{...rootProps}
				class={
					props.class
						? `${styles.checkbox} ${props.class}`
						: styles.checkbox
				}
			>
				<ArkCheckbox.Control class={styles.control} data-icon="">
					<ArkCheckbox.Indicator class={styles.indicator}>
						<Icon>{ICONS.check}</Icon>
					</ArkCheckbox.Indicator>
					<ArkCheckbox.Indicator
						indeterminate
						class={styles.indicator}
					>
						<Icon>remove</Icon>
					</ArkCheckbox.Indicator>
				</ArkCheckbox.Control>
				<ArkCheckbox.HiddenInput />
				<Show when={props.children}>
					<ArkCheckbox.Label class={styles.label}>
						{props.children}
					</ArkCheckbox.Label>
				</Show>
			</ArkCheckbox.Root>
		</MakeDisablable>
	);
}
