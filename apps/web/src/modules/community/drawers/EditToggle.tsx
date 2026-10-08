import { IconButton, isTypingTarget } from "@j-os/design-system";
import { createHotkey } from "@tanstack/solid-hotkeys";
import type { JSX } from "solid-js";

import { ICONS } from "../../../shared/icons.ts";

/**
 * Puts the person drawer into edit mode, and takes it out again.
 *
 * A padlock, not a pencil-and-tick. The tick implied the edits were being held
 * and committed when you pressed it — they are not: every field saves on blur
 * or on change, and closing the drawer without pressing anything keeps them.
 * There is nothing to confirm, so the button must not look like a confirmation.
 * A lock says what is actually true, that the fields are protected from a stray
 * keystroke until you deliberately open them.
 *
 * The icon shows the CURRENT state and the tooltip names the action, so the two
 * together read as "this is locked → click to unlock".
 *
 * `lock_open_right`, not `lock_open`: the latter leaves the shackle centred
 * over the body, so at icon size it is nearly the same silhouette as `lock` and
 * the mode change does not register. This one swings the shackle clear.
 */
export function EditToggle(props: {
	editing: boolean;
	onToggle: () => void;
	/** Whether `E` should fire — the drawer's own open state. A closed
	 *  drawer's toggle is not on screen, but this component would otherwise
	 *  stay mounted (or get re-created on the next open) and its binding has
	 *  to be told, not inferred, since it has no other way to know. */
	enabled: boolean;
}): JSX.Element {
	// `preventDefault: false`: a bare letter has no native browser behaviour
	// worth cancelling on match, and cancelling it before this guard gets to
	// run `isTypingTarget` would swallow the same keystroke while it is typed
	// into a field elsewhere in the open drawer. `ignoreInputs` is not set
	// here: the app root's `HotkeysProvider` supplies `false` for every binding.
	createHotkey(
		"E",
		(event) => {
			if (event.repeat || isTypingTarget(event.target)) return;
			event.preventDefault();
			props.onToggle();
		},
		() => ({ enabled: props.enabled, preventDefault: false })
	);

	return (
		<IconButton
			tooltipLabel={
				props.editing ? "Lock these fields" : "Unlock to edit"
			}
			shortcut="E"
			onClick={() => {
				props.onToggle();
			}}
		>
			{props.editing ? ICONS.unlock : ICONS.lock}
		</IconButton>
	);
}
