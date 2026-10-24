/**
 * The DOM side of a table's keyboard row focus: the `<table>` element itself,
 * claiming real focus for it, keys routed in from the document, and scrolling
 * the ringed row into view. The ring's state lives in `gridRing.ts`.
 */
import {
	createEffect,
	createUniqueId,
	onCleanup,
	onMount,
	type Accessor,
} from "solid-js";

import { isTypingTarget } from "../../utils/typingTarget.ts";

export function hasModifier(event: KeyboardEvent): boolean {
	return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

const TAB_SELECTOR = '[role="tab"]';

/** `:focus-visible`, defensively: a test DOM without the selector must not
 *  throw, and treats every focus as keyboard focus (the safe direction). */
function keyboardFocused(element: HTMLElement): boolean {
	try {
		return element.matches(":focus-visible");
	} catch {
		return true;
	}
}

/** ArrowDown on a horizontal tab: steps into the live table. A vertical
 *  tablist keeps ArrowDown for itself. */
function isTabArrowDownIntoGrid(
	target: HTMLElement,
	event: KeyboardEvent
): boolean {
	return (
		event.key === "ArrowDown" &&
		!hasModifier(event) &&
		target.closest('[aria-orientation="vertical"]') === null
	);
}

/** ArrowUp/ArrowDown/Enter with nothing focused, which reveals the grid. */
function isStrayRevealKey(event: KeyboardEvent): boolean {
	return (
		(event.target === document.body ||
			event.target === document.documentElement) &&
		!hasModifier(event) &&
		(event.key === "ArrowUp" ||
			event.key === "ArrowDown" ||
			event.key === "Enter")
	);
}

/** The grid's `<table>` element, once it is in the document. */
export type GridElement = {
	set: (element: HTMLTableElement) => void;
	focus: () => void;
	contains: (node: Node | null) => boolean;
	/** Whether this table is actually on screen and focusable. Several tables
	 *  can be live at once while hidden (a visited tab stays mounted), and only
	 *  the visible one may take focus. jsdom lacks `checkVisibility`; a missing
	 *  method reads as visible. */
	isVisible: () => boolean;
};

export function createGridElement(): GridElement {
	let reference: HTMLTableElement | undefined;
	return {
		set(element) {
			reference = element;
		},
		focus() {
			reference?.focus({ preventScroll: true });
		},
		contains(node) {
			return reference?.contains(node) ?? false;
		},
		isVisible() {
			if (!reference?.isConnected) return false;
			// Under an inert subtree (a modal's backdrop siblings) the table cannot
			// take focus, and `checkVisibility` does not know that.
			return reference.closest("[inert]") === null
				? typeof reference.checkVisibility !== "function" ||
						reference.checkVisibility()
				: false;
		},
	};
}

// Becoming the live table (mount, its tab shown, its sheet closed, a
// selection cleared) makes it the thing keys go to, so it takes focus. Not
// from a tab reached by keyboard: arrowing along a tablist selects each tab
// in turn, and pulling focus away would strand the keyboard on the first
// panel. A CLICKED tab keeps focus too (Chrome focuses a button on
// mousedown), but a mouse-focused element does not match `:focus-visible`
// until the next keydown, while one reached by an arrow does, so that is the
// tell. Not from a typing target either: that covers someone typing, and any
// open dialog. Deferred a microtask so the table is in the DOM on mount and
// the state that triggered this has settled.
export function claimGridFocus(grid: GridElement, isLive: () => boolean): void {
	queueMicrotask(() => {
		if (!isLive() || !grid.isVisible()) return;
		const active = document.activeElement;
		// A control already inside the table keeps focus: Space unchecking the
		// last row checkbox empties the selection and makes the table live, and
		// pulling focus up to the grid would take it off the checkbox.
		if (grid.contains(active)) return;
		if (active instanceof HTMLElement) {
			if (isTypingTarget(active)) return;
			if (
				active.closest(TAB_SELECTOR) !== null &&
				keyboardFocused(active)
			)
				return;
		}
		grid.focus();
	});
}

// Keys that arrive while focus is not in the table but the table should have
// them, routed here from the document. Two cases:
//  - ArrowDown from a focused tab steps into the live table, the keyboard
//    counterpart of clicking the tab. Ark's tablist prevents ArrowDown's
//    default even when horizontal, so `defaultPrevented` is deliberately not
//    checked. A vertical tablist keeps ArrowDown for itself.
//  - ArrowUp/ArrowDown/Enter with nothing focused (a modal closed without
//    restoring focus, a focused group header collapsed away) focus the grid.
//    They do not also move or activate: the ring was hidden while focus sat
//    on `body`, so the first key reveals it and the next acts. Acting on a
//    row the user could not see highlighted is what this scoping removes.
export function routeStrayKeys(options: {
	grid: GridElement;
	isLive: () => boolean;
	isEnabled: () => boolean | undefined;
	/** Re-reads whether focus is inside the grid; run on every document
	 *  `focusin` and, in the capture phase, every keydown. */
	syncFocusWithin: () => void;
}): void {
	const { grid, isLive, isEnabled, syncFocusWithin } = options;

	function routeStrayKey(event: KeyboardEvent): void {
		if (
			!(event.target instanceof HTMLElement) ||
			!isLive() ||
			!grid.isVisible()
		)
			return;
		if (event.target.closest(TAB_SELECTOR) !== null) {
			if (isTabArrowDownIntoGrid(event.target, event)) {
				event.preventDefault();
				grid.focus();
			}
			return;
		}
		// Another live table already claimed this key: the first one wins, so
		// two visible tables do not fight over it.
		if (event.defaultPrevented || !isStrayRevealKey(event)) return;
		event.preventDefault();
		grid.focus();
	}
	onMount(() => {
		// `focusableRows` is static table config, read once like the rest.
		if (!isEnabled()) return;
		document.addEventListener("keydown", routeStrayKey);
		document.addEventListener("keydown", syncFocusWithin, true);
		document.addEventListener("focusin", syncFocusWithin, true);
		onCleanup(() => {
			document.removeEventListener("keydown", routeStrayKey);
			document.removeEventListener("keydown", syncFocusWithin, true);
			document.removeEventListener("focusin", syncFocusWithin, true);
		});
	});
}

// Keep the ringed row on screen, the way the command palette keeps its
// highlighted option visible: stepping the ring with ↑/↓ (or an `advance()`
// after an action) can push it past the edge of the scroll box, and a ring you
// cannot see is a ring you cannot act on. `block: "nearest"` scrolls only when
// the row is actually clipped, so it never yanks the list while the row is
// already in view. Deferred a microtask so the row is in the DOM at fire time.
// Looked up by its DOM id, not by the `data-focused` stamp, so it still scrolls
// while the stamp is hidden (focus not yet in the table). The id carries this
// table's own prefix, so one table's ring cannot scroll another's.
export function scrollRingRowIntoView(
	ringRowId: Accessor<string | undefined>,
	domIdFor: (id: string) => string
): void {
	createEffect(() => {
		const id = ringRowId();
		if (id === undefined) return;
		queueMicrotask(() => {
			const row = document.getElementById(domIdFor(id));
			// jsdom performs no layout and ships no `scrollIntoView`; a test
			// environment must not be the thing that throws here.
			if (row && typeof row.scrollIntoView === "function")
				row.scrollIntoView({ block: "nearest" });
		});
	});
}

/** The DOM id each row carries (`<tr id>`), the target of
 *  `aria-activedescendant`. The prefix is this table's own, so two tables
 *  never share an id. */
export function createRowDomIds<Row>(
	isEnabled: () => boolean | undefined,
	rowId: (row: Row) => string
): {
	domIdFor: (id: string) => string;
	rowDomId: (row: Row) => string | undefined;
} {
	const rowDomPrefix = createUniqueId();
	function domIdFor(id: string): string {
		return `${rowDomPrefix}-row-${id}`;
	}
	function rowDomId(row: Row): string | undefined {
		return isEnabled() ? domIdFor(rowId(row)) : undefined;
	}
	return { domIdFor, rowDomId };
}
