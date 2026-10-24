import {
	Switch as ArkSwitch,
	type SwitchRootProps,
} from "@ark-ui/solid/switch";
import clsx from "clsx";
import { createUniqueId, type JSX, Show, splitProps } from "solid-js";

import {
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Switch.module.scss";

export type SwitchProps = PropsWithDisabling<
	Omit<SwitchRootProps, "children"> & {
		/** The switch's label; also its accessible name. */
		label: JSX.Element;
		/** One line under the label; also the switch's accessible description. */
		description?: JSX.Element;
	}
>;

/**
 * An on/off switch wrapping `@ark-ui/solid` Switch: the label and an optional
 * description on the left, the track on the right. The hidden input carries
 * `role="switch"`. Disabling goes through `PropsWithDisabling`: the reason
 * shows in a tooltip, and `disabled` also reaches the Root.
 *
 * Controlled (`checked` set): a click the owner does not accept leaves the
 * switch where the owner holds it. Ark only re-syncs the hidden input when
 * its own value changes, so the native click would otherwise leave the input
 * checked while the track shows off.
 */
export function Switch(props: SwitchProps): JSX.Element {
	const [others, disabling] = separateDisablingProps(props);
	const [local, rootProps] = splitProps(others, [
		"label",
		"description",
		"class",
	]);
	const descriptionId = createUniqueId();

	return (
		<MakeDisablable {...disabling}>
			<ArkSwitch.Root
				{...rootProps}
				class={clsx(styles.switch, local.class)}
			>
				<span class={styles.text}>
					<ArkSwitch.Label class={styles.label}>
						{local.label}
					</ArkSwitch.Label>
					<Show when={local.description}>
						<span id={descriptionId} class={styles.description}>
							{local.description}
						</span>
					</Show>
				</span>
				<ArkSwitch.Control class={styles.control}>
					<ArkSwitch.Thumb class={styles.thumb} />
				</ArkSwitch.Control>
				<ArkSwitch.HiddenInput
					role="switch"
					aria-describedby={
						local.description ? descriptionId : undefined
					}
					onClick={(event) => {
						const input = event.currentTarget;
						const held = props.checked;
						if (held === undefined) return;
						queueMicrotask(() => {
							input.checked = held;
						});
					}}
				/>
			</ArkSwitch.Root>
		</MakeDisablable>
	);
}
