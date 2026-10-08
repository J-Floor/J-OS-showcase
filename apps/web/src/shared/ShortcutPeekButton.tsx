import { IconButton, useShortcutPeek } from "@j-os/design-system";
import type { JSX } from "solid-js";

import styles from "./ShortcutPeekButton.module.scss";

/**
 * Reveals every keyboard shortcut on screen, and keeps them revealed.
 *
 * The same state holding Alt raises, latched instead of transient — which is
 * the point of having a button for it at all: you can read the chips with both
 * hands free, and go on clicking while they show.
 *
 * Hidden on touch screens (see the stylesheet): they have no keyboard, so a
 * control whose only job is to reveal keyboard hints reveals nothing there.
 */
export function ShortcutPeekButton(): JSX.Element {
	const peek = useShortcutPeek();
	return (
		<IconButton
			class={styles.button}
			tooltipLabel="Show keyboard shortcuts"
			// The same key that peeks while held (see ShortcutPeekProvider), shown
			// so the button names the shortcut it doubles for — ⌥ on a Mac, Alt
			// elsewhere, resolved by Kbd.
			shortcut="Alt"
			aria-pressed={peek.latched()}
			onClick={peek.toggleLatched}
		>
			{peek.latched() ? "keyboard_off" : "keyboard"}
		</IconButton>
	);
}
