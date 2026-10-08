import { isTypingTarget } from "@j-os/design-system";
import { createHotkeys } from "@tanstack/solid-hotkeys";

import {
	assertNoCollisions,
	eligible,
	type ActionDescriptor,
} from "./shortcuts.ts";

/**
 * Binds one scope's action keys.
 *
 * Target resolution, in order: the open drawer's person, then the checked rows,
 * then the focused row, then nothing. Focus and a checked selection are already
 * mutually exclusive in the table, so at most one of those two can be set — the
 * order is what makes the drawer win over both.
 *
 * Registered with `createHotkeys` (the plural primitive), not a `for` loop of
 * individual `createHotkey` calls: a plain loop reads `opts.actions()` outside
 * any tracked scope, so it would never re-diff the binding set if a descriptor
 * list ever changed shape, and it forces `enabled` to be repeated on every call.
 * The accessor form here tracks `opts.actions()` (and `opts.active()`, via the
 * shared options) properly.
 *
 * `ignoreInputs` is deliberately not set anywhere in this file: the app root
 * installs it once, via `HotkeysProvider`'s `defaultOptions.hotkey`, and every
 * binding in the app — this one included — inherits it from there.
 */
export function createActionKeys<Person>(opts: {
	actions: () => ActionDescriptor<Person>[];
	/** The person the open drawer is showing, if any. */
	drawerPerson: () => Person | undefined;
	/** The checked rows, empty when nothing is checked. */
	selected: () => Person[];
	/** The row the focus ring is on, if any. */
	focused: () => Person | undefined;
	/** Called after an action resolves against a focused row. */
	onAdvance: () => void;
	/** Called after a batch resolves. */
	onClearSelection: () => void;
	/** Whether this scope's tab is the one on screen. */
	active: () => boolean;
}): void {
	function handle(action: ActionDescriptor<Person>) {
		return (event: KeyboardEvent) => {
			// A held key repeats; one press must be one decision, or a
			// leaned-on `D` queues a confirm dialog per repeat.
			if (event.repeat) return;
			if (isTypingTarget(event.target)) return;
			if (!opts.active()) return;

			const person = opts.drawerPerson();
			if (person !== undefined) {
				if (!action.can(person)) return;
				event.preventDefault();
				void action.run(person);
				return;
			}

			const checked = opts.selected();
			if (checked.length > 0) {
				const targets = eligible(action, checked);
				if (targets.length === 0) return;
				event.preventDefault();
				void (async () => {
					for (const target of targets) await action.run(target);
					opts.onClearSelection();
				})();
				return;
			}

			const row = opts.focused();
			if (row === undefined) return;
			if (!action.can(row)) return;
			event.preventDefault();
			// Advance on RESOLVE, not on fire: a rejected mutation means the
			// row did not move, and moving the ring would say it had.
			void (async () => {
				await action.run(row);
				opts.onAdvance();
			})();
		};
	}

	createHotkeys(
		() => {
			const actions = opts.actions();
			assertNoCollisions(actions);
			return actions.map((action) => ({
				hotkey: action.hotkey,
				callback: handle(action),
			}));
		},
		// Shared by every action in this scope. A bare letter has no native
		// browser behaviour worth cancelling on match, and cancelling it before
		// `handle` gets to run `isTypingTarget` would swallow the same
		// keystroke while it is typed into a row's own note/score field.
		() => ({ enabled: opts.active(), preventDefault: false })
	);
}
