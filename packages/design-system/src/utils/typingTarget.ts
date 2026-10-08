/**
 * Whether a keystroke belongs to something being typed into, rather than to a
 * shortcut.
 *
 * Bare-letter shortcuts share a namespace with ordinary typing, so every one of
 * them has to ask this first. The community roster puts an "Add a note…" text
 * field and a score number field in EVERY row, and every filter is a popover
 * with an input in it — without this, typing `d` into a note denies the
 * applicant whose row it is.
 *
 * Blocked: `<textarea>`, `<select>`, contenteditable regions, an open overlay
 * (see below), and every `<input>` type that either takes free text (`text`,
 * `search`, `email`, `url`, `tel`, `password`, `number`) or has its own
 * native keyboard behaviour a shortcut would otherwise fight — `date`,
 * `time`, `datetime-local`, `month`, `week`, `range`, `color`, `file`. A
 * `<select>` and an `<input type="range">` both consume arrow keys
 * themselves; without this a bare-letter or arrow shortcut would fire at the
 * same time as the control's own value change, and a handler's
 * `preventDefault` would suppress the control's native behaviour outright.
 * The table's own arrows and Enter are scoped to the table element, so it
 * consults this only to decide whether it may claim focus.
 *
 * Deliberately NOT blocked: checkbox and radio inputs. They take no text and
 * have no arrow-key behaviour of their own to protect, and a focused row
 * checkbox is exactly where someone is most likely to press a decision key —
 * treating it as a typing target would silently swallow the bare-letter
 * shortcut it is meant to receive.
 *
 * An open overlay claims everything inside it. Ark marks its own parts with
 * `data-state="open"`, so a confirm dialog's buttons count as typing targets and
 * a second `D` cannot deny the person behind the dialog. A surface can opt OUT
 * with `data-shortcut-surface` — the person drawer does, because deciding the
 * person it shows IS its job, so its shortcuts must fire while focus is in it
 * (inputs inside it are still caught, so typing a note is still safe).
 */

/** Marks the Table's own `role="grid"`, which is not a typing target. */
export const TABLE_GRID_ATTR = "data-table-grid";

/** Input types that take free text, and so own a bare letter. */
const TEXTUAL_INPUT_TYPES = new Set([
	"text",
	"search",
	"email",
	"url",
	"tel",
	"password",
	"number",
]);

/** Input types with no free text of their own but with native keyboard
 *  behaviour (arrows, in particular) a shortcut would otherwise fight. */
const NATIVE_KEYBOARD_INPUT_TYPES = new Set([
	"date",
	"time",
	"datetime-local",
	"month",
	"week",
	"range",
	"color",
	"file",
]);

export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	// jsdom 29.1.1 does not implement `isContentEditable`, so this reads the
	// attribute directly instead. `closest` walks up to the nearest editable
	// ancestor, so a descendant of a contenteditable region is a typing target
	// too — but unlike real `isContentEditable` inheritance, this does not stop
	// at a nested `contenteditable="false"` island: `closest` walks straight
	// past it to the outer `true`/`plaintext-only` ancestor and still reports
	// editable. That's a false positive (treating a non-editable island as a
	// typing target), which is the safe direction for this check, so it is left
	// unhandled. The `i` flag makes the match ASCII case-insensitive, since the
	// HTML attribute value is case-insensitive but CSS attribute matching is not.
	if (
		target.closest(
			'[contenteditable="" i], [contenteditable="true" i], [contenteditable="plaintext-only" i]'
		) !== null
	)
		return true;
	// An open overlay claims everything inside it, so a confirm/alert dialog's own
	// controls count as typing targets and a second decision key cannot fire on
	// the person behind it. EXCEPT a surface that opts out with
	// `data-shortcut-surface`: the person drawer is a detail panel whose whole
	// point is deciding the person it shows, so its bare-letter shortcuts and its
	// nav arrows must fire while focus rests on the panel. `closest` stops at the
	// NEAREST open dialog, so a confirm opened on top of such a drawer (which
	// traps focus into itself, unmarked) still blocks correctly; and any real
	// input inside the drawer is still caught by the checks below, so typing a
	// note never fires a shortcut.
	const openDialog = target.closest('[role="dialog"][data-state="open"]');
	if (
		openDialog !== null &&
		!openDialog.hasAttribute("data-shortcut-surface")
	)
		return true;
	// A portaled overlay — a Select/Combobox listbox, a Menu, the DatePicker's
	// calendar grid — renders OUTSIDE the dialog that opened it (its own portal at
	// the end of <body>), so the dialog check above never sees it. Its own keys
	// must win: Enter picks the highlighted option, arrows move within the list. A
	// guest-config Select left this gap — pressing Enter on a host option leaked
	// past it to the roster's row-activate and opened the drawer behind the dialog.
	// The `role="grid"` entry is for the DatePicker's calendar grid. The Table's
	// own grid (`TABLE_GRID_ATTR`) is excluded: focus resting on the table is
	// exactly where row-scoped letter shortcuts must fire. An input inside a row
	// is still caught by the input checks below.
	if (
		target.closest(
			`[role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="grid"]:not([${TABLE_GRID_ATTR}])`
		) !== null
	)
		return true;
	if (target instanceof HTMLTextAreaElement) return true;
	if (target instanceof HTMLSelectElement) return true;
	if (target instanceof HTMLInputElement) {
		// eslint-disable-next-line no-restricted-syntax -- input type, not UI copy
		const type = target.type.toLowerCase();
		return (
			TEXTUAL_INPUT_TYPES.has(type) ||
			NATIVE_KEYBOARD_INPUT_TYPES.has(type)
		);
	}
	return false;
}
