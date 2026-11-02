import { isTypingTarget, useOverlayCovered } from "@j-os/design-system";
import { createHotkeys } from "@tanstack/solid-hotkeys";
import { onCleanup, type JSX } from "solid-js";

import { isRunning, runAction } from "./runAction.ts";
import {
	claimKeys,
	eligible,
	typesNothing,
	type ActionDescriptor,
} from "./shortcuts.ts";

/** A popup that has the keyboard while it is open: a select's or a
 *  combobox's list, a menu, a date picker's calendar. */
const OPEN_POPUP = [
	'[role="listbox"]',
	'[role="menu"]',
	'[data-scope="date-picker"][data-part="content"]',
]
	.map((popup) => `${popup}[data-state="open"]`)
	.join(", ");

/** Whether a dialog other than the sheet, or an open popup, has the key:
 *  the discard prompt or a confirm over the sheet, or a select's list open
 *  in its form (Escape closes the list, Enter picks an option). The sheet
 *  opts in to keys with `data-shortcut-surface`. Read for keys that fire
 *  while typing, which skip the typing check that would otherwise catch it. */
export function isHeldByPopup(target: EventTarget | null): boolean {
	if (document.querySelector(OPEN_POPUP) !== null) return true;
	if (!(target instanceof HTMLElement)) return false;
	const dialog = target.closest(
		'[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
	);
	return dialog !== null && !dialog.hasAttribute("data-shortcut-surface");
}

/** The keys a popup or dialog held when they arrived; see `noteHeld`. */
const heldOnArrival = new WeakSet<Event>();

/** How many bindings are mounted: the window listener lives while any is. */
let bindingCount = 0;

/** Notes a key a popup or dialog holds as it arrives, before any of them
 *  reacts. A select's list handles Enter or Escape on itself and closes at
 *  once, so by the time the key bubbles up to the bindings the list reads
 *  closed and the key would also run the form's action. */
function noteHeld(event: KeyboardEvent): void {
	if (isHeldByPopup(event.target)) heldOnArrival.add(event);
}

/**
 * Keeps `noteHeld` listening while this binding is mounted. One window
 * listener in the capture phase serves every binding, so a keypress reads
 * the popup state once however many scopes are mounted: added with the
 * first binding, removed with the last. The capture phase on the window
 * runs before the list's own listener, and before Ark's document listener
 * for Escape.
 */
function shareHeldTracking(): void {
	if (bindingCount === 0) {
		window.addEventListener("keydown", noteHeld, { capture: true });
	}
	bindingCount += 1;
	onCleanup(() => {
		bindingCount -= 1;
		if (bindingCount === 0) {
			window.removeEventListener("keydown", noteHeld, { capture: true });
		}
	});
}

/** Whether the key belongs to whatever has focus: a field being typed in,
 *  or a dialog or popup over the scope. A key that types nothing
 *  (`Mod+Enter`, `Escape`) fires from inside a field, so a form's Create or
 *  Save works while typing; it still yields to a dialog or popup, held when
 *  the key arrived (`heldOnArrival`) or now. */
function isClaimed(
	action: ActionDescriptor<never>,
	event: KeyboardEvent
): boolean {
	return typesNothing(action.hotkey)
		? heldOnArrival.has(event) || isHeldByPopup(event.target)
		: isTypingTarget(event.target);
}

/** What `createActionKeys` binds. */
export type ActionKeysOptions<Target> = {
	/** Where the keys are live; see `claimKeys`. */
	scope: string;
	actions: () => ActionDescriptor<Target>[];
	/** What the scope itself acts on, if anything now: the row its sheet
	 *  shows, its create form, the page. None for a table's own keys. */
	target?: () => Target | undefined;
	/** The checked rows, empty when nothing is checked. */
	selected?: () => Target[];
	/** The row the focus ring is on, if any. */
	focused?: () => Target | undefined;
	/** Called after an action resolves against a focused row. */
	onAdvance?: () => void;
	/** Called after a batch resolves. */
	onClearSelection?: () => void;
	/** Whether this scope's tab or sheet is the one on screen. */
	active: () => boolean;
};

/**
 * Binds one scope's action keys.
 *
 * Target resolution, in order: the scope's own target (the open sheet's row,
 * a create form, the page), then the checked rows,
 * then the focused row, then nothing. Focus and a checked selection are already
 * mutually exclusive in the table, so at most one of those two can be set — the
 * order is what makes the sheet win over both.
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
 *
 * A scope with no table (a sheet's own footer keys) leaves out `selected`,
 * `focused`, `onAdvance` and `onClearSelection`: `target` is then the only
 * one.
 *
 * A key that types nothing (`Mod+Enter`, `Escape`; see `typesNothing`) also
 * fires while typing in a field, so a form's footer action needs no binding
 * of its own. A run still in flight swallows a second press (`runAction`).
 *
 * Where it is called decides what can cover the keys (`useOverlayCovered`):
 * called inside a sheet's parts, an overlay shown above that sheet (a peek, a
 * confirm); anywhere else, any overlay (a sheet over the page). While one
 * stays open the keys stay quiet: they belong to what is on top. A sheet's
 * keys are therefore bound by a part rendered inside it (`ActionKeys`).
 */

export function createActionKeys<Target>(
	options: ActionKeysOptions<Target>
): void {
	const {
		selected = () => [],
		onAdvance = () => {},
		onClearSelection = () => {},
	} = options;
	const isCovered = useOverlayCovered();
	shareHeldTracking();

	/** The focused row's turn: run on it, then move the ring on. */
	function runOnFocused(
		action: ActionDescriptor<Target>,
		event: KeyboardEvent
	): void {
		const row = options.focused?.();
		if (row === undefined || !action.can(row)) return;
		event.preventDefault();
		// A press the row's run in flight swallows decides nothing: the
		// ring stays put, or it would leave the row before its run lands.
		if (isRunning(action, row)) return;
		// Advance on RESOLVE, not on fire: a rejected mutation means the
		// row did not move, and moving the ring would say it had.
		void (async () => {
			const outcome = await runAction(action, row);
			if (outcome?.refused) return;
			onAdvance();
		})();
	}

	function handle(action: ActionDescriptor<Target>) {
		return (event: KeyboardEvent) => {
			// A held key repeats; one press must be one decision, or a
			// leaned-on `D` queues a confirm dialog per repeat.
			if (
				event.repeat ||
				isClaimed(action, event) ||
				!options.active() ||
				isCovered()
			)
				return;

			const shown = options.target?.();
			if (shown !== undefined) {
				if (!action.can(shown)) return;
				event.preventDefault();
				// The action reports its own failure.
				void runAction(action, shown);
				return;
			}

			const checked = selected();
			if (checked.length > 0) {
				const targets = eligible(action, checked);
				if (targets.length === 0) return;
				event.preventDefault();
				void (async () => {
					for (const target of targets) {
						// Stop at the first failure: the rest of the batch would
						// fail the same way, and the selection must survive it.
						const outcome = await runAction(action, target);
						if (outcome?.refused) return;
					}
					onClearSelection();
				})();
				return;
			}

			runOnFocused(action, event);
		};
	}

	let release: (() => void) | undefined;
	onCleanup(() => {
		release?.();
	});
	createHotkeys(
		() => {
			const actions = options.actions();
			release?.();
			release = undefined;
			release = claimKeys(options.scope, actions);
			return actions.map((action) => ({
				hotkey: action.hotkey,
				callback: handle(action),
			}));
		},
		// Shared by every action in this scope. A bare letter has no native
		// browser behaviour worth cancelling on match, and cancelling it before
		// `handle` gets to run `isTypingTarget` would swallow the same
		// keystroke while it is typed into a row's own note/score field.
		() => ({ enabled: options.active(), preventDefault: false })
	);
}

/** `createActionKeys` as a part, for the keys of a sheet built outside it:
 *  rendered inside the sheet, its keys yield to what is shown above the
 *  sheet, not to the sheet itself. */
export function ActionKeys<Target>(
	props: ActionKeysOptions<Target>
): JSX.Element {
	createActionKeys(props);
	return null;
}
