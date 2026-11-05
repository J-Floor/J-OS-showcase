import { Confetti } from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import styles from "./ActionBar.module.scss";
import { ActionButton } from "./ActionButton.tsx";
import type { ActionDescriptor } from "./shortcuts.ts";

/** What `ActionBar` takes: the descriptors, and the target they act on. */
export type ActionBarProps<Target> = {
	/** The SAME descriptors that drive the row buttons and the keys
	 *  (`createActionKeys`), not a second copy. */
	actions: readonly ActionDescriptor<Target>[];
	target: Target;
	/**
	 * Leave out the actions `target` cannot take, rather than showing them
	 * disabled with their reason. For a list of decisions, where an action that
	 * does not apply is noise; a set of states, where the current one is
	 * worth seeing, keeps it shown and disabled.
	 */
	hideUnavailable?: boolean;
};

/**
 * A sheet footer's actions, written out as full-width buttons in equal
 * columns: as many across as fit, one per row on a phone.
 *
 * Buttons are `secondary` unless an action is marked `primary`: among peers, a
 * primary would read as the recommended answer, so only mark an action that is
 * the point of its sheet rather than one answer among several. The `Kbd` chip
 * shows only while peeking, in the icon's place. An action marked `celebrate`
 * is wrapped in `Confetti`. A run in flight shows its spinner (`ActionButton`).
 */
export function ActionBar<Target>(props: ActionBarProps<Target>): JSX.Element {
	return (
		<div class={styles.bar}>
			<For each={props.actions}>
				{(action) => {
					function isAvailable(): boolean {
						return action.can(props.target);
					}
					// Icon and chip swap rather than share the width: the
					// footer's columns are narrow, and icon + label + chip
					// together overflowed.
					const button = (
						<ActionButton
							action={action}
							target={props.target}
							variant={action.primary ? "primary" : "secondary"}
							contentClass={styles.tight}
						/>
					);
					return (
						<Show when={!props.hideUnavailable || isAvailable()}>
							<Show when={action.celebrate} fallback={button}>
								<Confetti>{button}</Confetti>
							</Show>
						</Show>
					);
				}}
			</For>
		</div>
	);
}
