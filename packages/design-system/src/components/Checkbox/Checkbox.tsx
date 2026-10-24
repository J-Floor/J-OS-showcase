import {
	Checkbox as ArkCheckbox,
	type CheckboxRootProps,
} from "@ark-ui/solid/checkbox";
import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";

import { ICONS } from "../../icons.ts";
import {
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { Icon } from "../Icon/Icon.tsx";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Checkbox.module.scss";

export type CheckboxProps = PropsWithDisabling<
	Omit<CheckboxRootProps, "children"> & {
		/** Optional label rendered next to the control. */
		children?: JSX.Element;
	} & WithPartClasses<"control" | "indicator" | "label">
>;

/**
 * Tri-state checkbox wrapping `@ark-ui/solid` Checkbox
 * (`Root`/`Control`/`Indicator`/`HiddenInput`).
 *
 * Ported from EmboUI's Checkbox. React→Solid: no `forwardRef`; `useState`-free.
 * Disabling goes through `PropsWithDisabling` like every other control:
 * `MakeDisablable` wraps the Root in a non-interactive `<span>` that carries
 * the dim and the reason tooltip (so the Root `<label>` is never nested inside
 * a trigger `<button>`), and `disabled` also reaches the Root so the
 * checkbox ignores the keyboard.
 */
export function Checkbox(props: CheckboxProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	const [local, rootProps] = splitProps(others, [
		"children",
		"class",
		"classOverride",
	]);

	return (
		<MakeDisablable {...disabling}>
			<ArkCheckbox.Root
				{...rootProps}
				class={clsx(styles.checkbox, local.class)}
			>
				<ArkCheckbox.Control
					class={getPartStyles(styles, local, "control")}
					data-icon=""
				>
					<ArkCheckbox.Indicator
						class={getPartStyles(styles, local, "indicator")}
					>
						<Icon>{ICONS.check}</Icon>
					</ArkCheckbox.Indicator>
					<ArkCheckbox.Indicator
						indeterminate
						class={getPartStyles(styles, local, "indicator")}
					>
						<Icon>remove</Icon>
					</ArkCheckbox.Indicator>
				</ArkCheckbox.Control>
				<ArkCheckbox.HiddenInput />
				<Show when={local.children}>
					<ArkCheckbox.Label
						class={getPartStyles(styles, local, "label")}
					>
						{local.children}
					</ArkCheckbox.Label>
				</Show>
			</ArkCheckbox.Root>
		</MakeDisablable>
	);
}
