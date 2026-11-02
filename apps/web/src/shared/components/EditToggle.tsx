import { IconButton } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { createActionKeys } from "../actions/createActionKeys.ts";
import type { ActionDescriptor } from "../actions/shortcuts.ts";
import { ICONS } from "../icons.ts";

/** What the toggle acts on: its own sheet's fields. */
const FIELDS_TARGET = "fields";
type FieldsTarget = typeof FIELDS_TARGET;

/**
 * An entity sheet's lock/unlock toggle. Puts the sheet into edit mode, and
 * takes it out again.
 *
 * A padlock, not a pencil-and-tick. The tick implied the edits were being held
 * and committed when you pressed it — they are not: every field saves on blur
 * or on change, and closing the sheet without pressing anything keeps them.
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
	/** Whether `E` should fire — the sheet's own open state. A closed
	 *  sheet's toggle is not on screen, but this component would otherwise
	 *  stay mounted (or get re-created on the next open) and its binding has
	 *  to be told, not inferred, since it has no other way to know. */
	enabled: boolean;
}): JSX.Element {
	// Keyed like every other action: ignored while typing or on a repeat,
	// and quiet while an overlay covers the sheet holding the toggle (bound
	// from inside it).
	const toggle: ActionDescriptor<FieldsTarget> = {
		id: "toggle-editing",
		get label() {
			return props.editing ? "Lock these fields" : "Unlock to edit";
		},
		icon: ICONS.lock,
		hotkey: "E",
		can: () => true,
		run: () => {
			props.onToggle();
		},
	};
	createActionKeys<FieldsTarget>({
		scope: "edit-toggle",
		actions: () => [toggle],
		target: () => FIELDS_TARGET,
		active: () => props.enabled,
	});

	return (
		<IconButton
			tooltipLabel={toggle.label}
			shortcut={toggle.hotkey}
			onClick={() => {
				props.onToggle();
			}}
		>
			{props.editing ? ICONS.unlock : ICONS.lock}
		</IconButton>
	);
}
