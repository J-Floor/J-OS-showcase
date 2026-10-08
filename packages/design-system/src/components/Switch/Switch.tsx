import {
	Switch as ArkSwitch,
	type SwitchRootProps,
} from "@ark-ui/solid/switch";
import clsx from "clsx";
import { createUniqueId, type JSX, Show, splitProps } from "solid-js";

import styles from "./Switch.module.scss";

export type SwitchProps = {
	/** The switch's label; also its accessible name. */
	label: JSX.Element;
	/** One line under the label; also the switch's accessible description. */
	description?: JSX.Element;
	/** Class applied to the Root element. */
	class?: string;
} & Omit<SwitchRootProps, "class" | "children">;

/**
 * An on/off switch wrapping `@ark-ui/solid` Switch: the label and an optional
 * description on the left, the track on the right. The hidden input carries
 * `role="switch"`.
 *
 * Controlled (`checked` set): a click the owner does not accept leaves the
 * switch where the owner holds it. Ark only re-syncs the hidden input when
 * its own value changes, so the native click would otherwise leave the input
 * checked while the track shows off.
 */
export function Switch(props: SwitchProps): JSX.Element {
	const [local, rootProps] = splitProps(props, [
		"label",
		"description",
		"class",
	]);
	const descriptionId = createUniqueId();

	return (
		<ArkSwitch.Root {...rootProps} class={clsx(styles.switch, local.class)}>
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
				aria-describedby={local.description ? descriptionId : undefined}
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
	);
}
