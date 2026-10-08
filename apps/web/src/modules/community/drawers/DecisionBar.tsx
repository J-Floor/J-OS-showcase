import {
	Button,
	Confetti,
	Icon,
	Kbd,
	useShortcutPeek,
} from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import type { ActionDescriptor } from "../actions/shortcuts.ts";

import styles from "./DecisionBar.module.scss";

/**
 * The drawer's footer: every action available on the person it shows, written
 * out as buttons, at the foot of the panel.
 *
 * Reading the person is what the drawer is for — the description, the history,
 * why they want to join — and the point of this bar is to let you act on what
 * you just read without closing the drawer and hunting for the row again.
 *
 * It renders whatever `ActionDescriptor` list the tab already has — the SAME one
 * that drives the row's icon buttons and the key bindings (`createActionKeys`),
 * not a second copy. So Applications shows make-guest/member/turn-down, Members
 * shows change-role/kick, Guests shows its own set, each staying in step with its
 * row automatically. An action appears only where its `can(person)` is true, so
 * the footer never offers a decision the row would refuse.
 *
 * All buttons are `secondary`: one primary among them would read as the
 * recommended answer, and which decision a person deserves is the board's
 * judgement, not the console's. The `Kbd` chip is inline, so it shows only while
 * peeking. A `member` action is wrapped in `Confetti` — approving a member is
 * the one decision worth celebrating.
 */
export function DecisionBar<Person>(props: {
	person: Person;
	actions: ActionDescriptor<Person>[];
}): JSX.Element {
	const peek = useShortcutPeek();
	return (
		<div class={styles.bar}>
			<For each={props.actions}>
				{(action) => {
					const button = (
						<Button
							classOverride={{ contentClass: styles.tight }}
							variant="secondary"
							onClick={() => void action.run(props.person)}
						>
							{/* Icon and chip swap rather than share the width: the
							    footer's columns are narrow, and icon + label + chip
							    together overflowed. While peeking the chip is up, so
							    the icon gives up its place; otherwise the icon shows
							    and there is no chip. */}
							<Show
								when={peek.peeking()}
								fallback={<Icon>{action.icon}</Icon>}
							>
								<Kbd shortcut={action.hotkey} inline />
							</Show>
							{action.label}
						</Button>
					);
					return (
						<Show when={action.can(props.person)}>
							<Show
								when={action.id === "member"}
								fallback={button}
							>
								<Confetti>{button}</Confetti>
							</Show>
						</Show>
					);
				}}
			</For>
		</div>
	);
}
