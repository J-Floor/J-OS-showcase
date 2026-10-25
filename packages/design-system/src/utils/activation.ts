import {
	formatHotkey,
	hasNonModifierKey,
	isModifierKey,
	matchesKeyboardEvent,
	parseHotkey,
} from "@tanstack/solid-hotkeys";

import { ENTITY_ROW } from "./morphPairing.ts";
import { type ShortcutHint } from "./types.ts";
import { isTypingTarget } from "./typingTarget.ts";
import { isVisible, nearestVisibleAnchor } from "./visibleArea.ts";

/**
 * The element a person last activated: an overlay that opens right after
 * morphs out of it: what was clicked, picked with Enter or Space, or the
 * control whose shortcut key was pressed. Capture listeners keep a reference
 * and a timestamp; only a shortcut key looks at the page, for the controls
 * that name a key (`aria-keyshortcuts`).
 *
 * Only an activation within {@link ACTIVATION_TTL_MS} counts, so a sheet opened
 * by a shortcut does not grow out of a button clicked minutes earlier.
 */
export const ACTIVATION_TTL_MS = 1000;

/** Roles a person activates. Cell roles are left out: the row holding a
 *  cell is what was acted on. */
const INTERACTIVE_ROLES = [
	"button",
	"link",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"tab",
	"treeitem",
	"switch",
	"checkbox",
	"radio",
]
	.map((role) => `[role="${role}"]`)
	.join(", ");

const ACTIVATABLE = `button, a, summary, ${INTERACTIVE_ROLES}, ${ENTITY_ROW}`;

/** The attribute a control names its shortcut keys in (space-separated). */
const KEY_SHORTCUTS = "aria-keyshortcuts";

/** A surface that owns the keys pressed inside it (a sheet, a dialog). */
const OVERLAY = `[role="dialog"], [role="alertdialog"]`;

let last: { element: HTMLElement; at: number } | undefined;

/**
 * The `aria-keyshortcuts` value for a shortcut hint: ARIA's own spelling
 * (`Control+Shift+S`, `Mod` resolved for this platform). None for a lone
 * modifier, which is a display hint and fires nothing.
 */
export function keyShortcutsOf(
	hint: ShortcutHint | undefined
): string | undefined {
	if (!hint) return undefined;
	const parsed = parseHotkey(hint);
	return hasNonModifierKey(parsed) ? formatHotkey(parsed) : undefined;
}

/** What a widget holding focus for its items (a grid's ring row) names as
 *  its current item through `aria-activedescendant`; the key acts on that
 *  item, not on the widget. */
function activeDescendant(target: Element): Element | null {
	const id = target.getAttribute("aria-activedescendant");
	return id ? target.ownerDocument.getElementById(id) : null;
}

function remember(element: HTMLElement | null): void {
	if (element) last = { element, at: Date.now() };
}

function record(event: Event): void {
	const target = event.target;
	if (!(target instanceof Element)) return;
	const acted =
		(event.type === "keydown" ? activeDescendant(target) : null) ?? target;
	remember(acted.closest<HTMLElement>(ACTIVATABLE));
}

/** Whether `element` names the key `event` pressed. The same matcher the
 *  hotkey bindings use, so the control found is the one that fires. */
function namesKey(element: Element, event: KeyboardEvent): boolean {
	const shortcuts = element.getAttribute(KEY_SHORTCUTS)?.split(/\s+/) ?? [];
	return shortcuts.some(
		(shortcut) =>
			shortcut !== "" &&
			matchesKeyboardEvent(event, parseHotkey(shortcut))
	);
}

/** The first control on screen in `scope` naming the key `event` pressed
 *  that `isCandidate` keeps. */
function shortcutIn(
	scope: ParentNode,
	event: KeyboardEvent,
	isCandidate: (element: HTMLElement) => boolean = () => true
): HTMLElement | null {
	for (const element of scope.querySelectorAll<HTMLElement>(
		`[${KEY_SHORTCUTS}]`
	)) {
		if (
			namesKey(element, event) &&
			isCandidate(element) &&
			isVisible(element)
		)
			return element;
	}
	return null;
}

function outsideRows(element: HTMLElement): boolean {
	return element.closest(ENTITY_ROW) === null;
}

/**
 * The control a shortcut key fires: the one naming that key inside the
 * focused row when there is one, else inside the overlay holding focus, else
 * anywhere. Outside the focused row, rows' own controls do not count:
 * another row's copy of a row action is not the one that fires.
 */
function shortcutTarget(
	event: KeyboardEvent,
	target: Element
): HTMLElement | null {
	const focused = activeDescendant(target) ?? target;
	const row = focused.closest(ENTITY_ROW);
	const overlay = target.closest(OVERLAY);
	return (
		(row ? shortcutIn(row, event) : null) ??
		(overlay ? shortcutIn(overlay, event, outsideRows) : null) ??
		shortcutIn(target.ownerDocument, event, outsideRows)
	);
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key === "Enter" || event.key === " ") {
		record(event);
		return;
	}
	if (event.repeat || isModifierKey(event.key)) return;
	const target = event.target;
	if (!(target instanceof Element) || isTypingTarget(target)) return;
	remember(shortcutTarget(event, target));
}

/** Installs the capture listeners; returns an uninstall function. */
export function trackActivation(target: Document = document): () => void {
	target.addEventListener("pointerdown", record, { capture: true });
	target.addEventListener("keydown", onKeyDown, { capture: true });
	return () => {
		target.removeEventListener("pointerdown", record, { capture: true });
		target.removeEventListener("keydown", onKeyDown, { capture: true });
		last = undefined;
	};
}

/**
 * The element activated within ACTIVATION_TTL_MS, if still connected and
 * visible; for one inside a popup that has since closed (a menu item), the
 * popup's trigger.
 */
export function recentActivation(): HTMLElement | null {
	return last && Date.now() - last.at <= ACTIVATION_TTL_MS
		? nearestVisibleAnchor(last.element)
		: null;
}

/**
 * Whether {@link recentActivation} stands in for a pick in a popup that has
 * since closed: it is that popup's trigger, not what was activated.
 */
export function isActivationThroughPopup(): boolean {
	const anchor = recentActivation();
	return anchor !== null && anchor !== last?.element;
}
