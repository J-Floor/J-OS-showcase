import {
	Icon,
	Kbd,
	useOverlayCovered,
	useShortcutPeek,
} from "@j-os/design-system";
import type { Hotkey } from "@tanstack/solid-hotkeys";
import { Show, type JSX } from "solid-js";

/**
 * A button's leading glyph: its icon, or the key's chip while peeking. They
 * swap rather than share the width, so a button never grows when the chips
 * appear. Under an open overlay the chip stays hidden: the button's keys
 * are quiet there (`createActionKeys` reads the same `useOverlayCovered`),
 * so its chip would name a key that does nothing.
 */
export function ActionGlyph(props: {
	icon: string;
	hotkey: Hotkey;
}): JSX.Element {
	const peek = useShortcutPeek();
	const isCovered = useOverlayCovered();
	return (
		<Show
			when={peek.peeking() && !isCovered()}
			fallback={<Icon>{props.icon}</Icon>}
		>
			<Kbd shortcut={props.hotkey} inline />
		</Show>
	);
}
