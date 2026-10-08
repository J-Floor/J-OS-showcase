/**
 * Keyboard row focus for `Table.Root` with `focusableRows`: the focus ring
 * (see `ringMachine.ts`), the grid's own keys, claiming real focus when the
 * table becomes live, keys routed in from the document, scrolling the ringed
 * row into view, and reporting it through `onFocusedRowChange`.
 */
import type { Row as TanRow } from "@tanstack/solid-table";
import {
	type JSX,
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	on,
	onCleanup,
	onMount,
	untrack,
} from "solid-js";

import { TABLE_GRID_ATTR, isTypingTarget } from "../../utils/typingTarget.ts";

import {
	INITIAL_RING,
	isLive,
	ringId,
	step,
	type RingContext,
	type RingEvent,
	type RingState,
} from "./ringMachine.ts";
import type { TableRootProps } from "./Table.tsx";

function hasModifier(event: KeyboardEvent): boolean {
	return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

const TAB_SELECTOR = '[role="tab"]';

export type GridFocus<Data extends Record<string, unknown>> = {
	/** Spread onto the `<table>`. Empty unless `focusableRows` is on. */
	gridAttributes: () => JSX.HTMLAttributes<HTMLTableElement> & {
		[TABLE_GRID_ATTR]?: "";
	};
	/** Whether the ring is shown on this row; drives `data-focused`. */
	isRowFocused: (row: TanRow<Data>) => boolean;
	/** The row's DOM id (`<tr id>`), the target of `aria-activedescendant`. */
	rowDomId: (row: TanRow<Data>) => string | undefined;
};

export function createGridFocus<Data extends Record<string, unknown>>(opts: {
	props: Pick<
		TableRootProps<Data>,
		| "focusableRows"
		| "autofocusFirstRow"
		| "suppressFocus"
		| "activeRowId"
		| "onFocusedRowChange"
		| "onRowActivate"
		| "focusApi"
	>;
	/** The rows the ring can land on, in render order. */
	rows: () => TanRow<Data>[];
	/** The row's id (see `rowId` in Table.tsx), or `undefined` when it has none. */
	rowId: (row: TanRow<Data>) => string | undefined;
	/** Whether a checkbox selection owns the keys. */
	selectionActive: () => boolean;
}): GridFocus<Data> {
	const { props, rows, rowId, selectionActive } = opts;

	const rowDomPrefix = createUniqueId();
	function domIdFor(id: string): string {
		return `${rowDomPrefix}-row-${id}`;
	}
	function rowDomId(row: TanRow<Data>): string | undefined {
		const id = rowId(row);
		return props.focusableRows && id !== undefined
			? domIdFor(id)
			: undefined;
	}
	let gridRef: HTMLTableElement | undefined = undefined;

	/**
	 * Whether the focus ring is shown on this row.
	 *
	 * Not a plain `rowId(row) === stampedRowId()`: both sides can independently
	 * be `undefined` — a row with no usable `_id`, and the ring hidden or
	 * nowhere — and those two `undefined`s must never be treated as equal to
	 * each other, or every row with no id would render as focused before any
	 * keypress.
	 */
	function isRowFocused(row: TanRow<Data>): boolean {
		const id = rowId(row);
		return id !== undefined && id === stampedRowId();
	}

	function rowById(id: string | undefined): TanRow<Data> | undefined {
		return id === undefined
			? undefined
			: rows().find((candidate) => rowId(candidate) === id);
	}

	function ringContext(): RingContext {
		return {
			rowIds: rows().map(rowId),
			autofocusFirstRow: props.autofocusFirstRow ?? false,
		};
	}

	/** Where the ring is and why: see `ringMachine.ts`. Held by id, not index, so
	 *  it survives the data changing under it (triage moves rows between groups). */
	const [ring, setRing] = createSignal<RingState>(INITIAL_RING);

	function dispatch(event: RingEvent): void {
		const next = step(ring(), event, untrack(ringContext));
		setRing(next.state);
		if (next.takeFocus) claimFocus();
	}

	// Becoming the live table (mount, its tab shown, its drawer closed, a
	// selection cleared) makes it the thing keys go to, so it takes focus. Not
	// from a tab reached by keyboard: arrowing along a tablist selects each tab
	// in turn, and pulling focus away would strand the keyboard on the first
	// panel. A CLICKED tab keeps focus too (Chrome focuses a button on
	// mousedown), but a mouse-focused element does not match `:focus-visible`
	// until the next keydown, while one reached by an arrow does, so that is the
	// tell. Not from a typing target either: that covers someone typing, and any
	// open dialog. Deferred a microtask so the table is in the DOM on mount and
	// the state that triggered this has settled.
	function claimFocus(): void {
		queueMicrotask(() => {
			if (!ringLive() || !gridVisible()) return;
			const active = document.activeElement;
			// A control already inside the table keeps focus: Space unchecking the
			// last row checkbox empties the selection and makes the table live, and
			// pulling focus up to the grid would take it off the checkbox.
			if (gridRef?.contains(active)) return;
			if (active instanceof HTMLElement) {
				if (isTypingTarget(active)) return;
				if (
					active.closest(TAB_SELECTOR) !== null &&
					keyboardFocused(active)
				)
					return;
			}
			gridRef?.focus({ preventScroll: true });
		});
	}

	/** `:focus-visible`, defensively: a test DOM without the selector must not
	 *  throw, and treats every focus as keyboard focus (the safe direction). */
	function keyboardFocused(el: HTMLElement): boolean {
		try {
			return el.matches(":focus-visible");
		} catch {
			return true;
		}
	}

	/** Whether this table is actually on screen and focusable. Several tables can be live at
	 *  once while hidden (a visited tab stays mounted), and only the visible one
	 *  may take focus. jsdom lacks `checkVisibility`; a missing method reads as
	 *  visible. */
	function gridVisible(): boolean {
		if (!gridRef?.isConnected) return false;
		// Under an inert subtree (a modal's backdrop siblings) the table cannot
		// take focus, and `checkVisibility` does not know that.
		if (gridRef.closest("[inert]") !== null) return false;
		return (
			typeof gridRef.checkVisibility !== "function" ||
			gridRef.checkVisibility()
		);
	}

	/** Re-reads whether focus is inside the grid from the DOM. Chrome fires no
	 *  `focusout` when a focused node is simply removed (a virtualized row's note
	 *  input scrolling out, a collapsed group header), so `focusWithin` would
	 *  stay true with focus on `body` and the ring would keep showing. Called
	 *  from every document `focusin` and, in the capture phase, every keydown,
	 *  instead of polling. Capture, so it runs before any bubble-phase keydown
	 *  listener (the letter shortcuts) reads the ring's row. */
	function syncFocusWithin(): void {
		setFocusWithin(gridRef?.contains(document.activeElement) ?? false);
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
	function routeStrayKey(event: KeyboardEvent): void {
		if (!(event.target instanceof HTMLElement)) return;
		if (!ringLive() || !gridVisible()) return;
		if (event.target.closest(TAB_SELECTOR) !== null) {
			if (
				event.key === "ArrowDown" &&
				!hasModifier(event) &&
				event.target.closest('[aria-orientation="vertical"]') === null
			) {
				event.preventDefault();
				gridRef?.focus({ preventScroll: true });
			}
			return;
		}
		// Another live table already claimed this key: the first one wins, so
		// two visible tables do not fight over it.
		if (event.defaultPrevented) return;
		if (
			event.target !== document.body &&
			event.target !== document.documentElement
		)
			return;
		if (hasModifier(event)) return;
		if (
			event.key !== "ArrowUp" &&
			event.key !== "ArrowDown" &&
			event.key !== "Enter"
		)
			return;
		event.preventDefault();
		gridRef?.focus({ preventScroll: true });
	}
	onMount(() => {
		// `focusableRows` is static table config, read once like the rest.
		if (!props.focusableRows) return;
		document.addEventListener("keydown", routeStrayKey);
		document.addEventListener("keydown", syncFocusWithin, true);
		document.addEventListener("focusin", syncFocusWithin, true);
		onCleanup(() => {
			document.removeEventListener("keydown", routeStrayKey);
			document.removeEventListener("keydown", syncFocusWithin, true);
			document.removeEventListener("focusin", syncFocusWithin, true);
		});
	});

	createEffect(() => {
		if (!props.focusableRows) return;
		const inputs = {
			selection: selectionActive(),
			suppressed: props.suppressFocus ?? false,
			pinned: props.activeRowId?.(),
		};
		untrack(() => {
			dispatch({ type: "inputs", inputs });
		});
	});

	// The ring's row, whether or not focus is in the table.
	const ringRowId = createMemo(() =>
		props.focusableRows ? ringId(ring(), ringContext()) : undefined
	);

	// The ring is real-focus only. A row is stamped `data-focused` (and reported
	// through `onFocusedRowChange`) only while focus is somewhere within this
	// table, or while an open drawer pins it. With focus on a topbar button or a
	// filter, nothing is stamped, so the ring, the row-scoped letter shortcuts
	// and their chips all go quiet together instead of the ring promising keys
	// that no longer reach it. Focus INSIDE a row (the note input `N` opens)
	// still counts.
	const [focusWithin, setFocusWithin] = createSignal(false);
	function ringShown(): boolean {
		return focusWithin() || ring().kind === "pinned";
	}
	// The row that is stamped and reported: `ringRowId` while the ring is shown.
	const stampedRowId = createMemo(() =>
		ringShown() ? ringRowId() : undefined
	);

	// Report the stamped row whenever it changes, including to `undefined`. Not
	// `defer`red: that would also skip the autofocused first row on mount.
	let reported: string | undefined = undefined;
	createEffect(
		on(stampedRowId, (id) => {
			if (id === reported) return;
			reported = id;
			props.onFocusedRowChange?.(rowById(id)?.original);
		})
	);

	/** Whether arrows and Enter act on the ring. Not while a checkbox selection
	 *  owns the keys, a caller has suppressed it (an open drawer, an off-screen
	 *  tab), or a drawer pins it. */
	function ringLive(): boolean {
		return isLive(ring());
	}

	/**
	 * Moves the ring to whatever now occupies the index the focused row held.
	 * Meant to be called after an action resolves and the acted-on row has left
	 * this group.
	 */
	function advance(): void {
		dispatch({ type: "advance" });
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

	onMount(() => {
		props.focusApi?.({ advance });
	});

	// The table owns its keys only while it holds real focus, and only when the
	// keystroke is aimed at the table itself: Enter on a button in a row, or a
	// key in a row's field, bubbles here with a different target and belongs to
	// that control. Keys pressed anywhere else on the page never arrive at all.
	function handleGridKeyDown(event: KeyboardEvent): void {
		if (event.target !== event.currentTarget) return;
		if (hasModifier(event)) return;
		if (!ringLive()) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (rows().length === 0) return;
			event.preventDefault();
			dispatch({
				type: "arrow",
				delta: event.key === "ArrowDown" ? 1 : -1,
			});
			return;
		}
		if (event.key !== "Enter") return;
		const row = rowById(ringRowId());
		if (!row) return;
		event.preventDefault();
		props.onRowActivate?.(row.original);
	}

	/** The grid's focus and keyboard wiring, shared by both `<table>` branches.
	 *  Spread onto the element; called inside the spread's effect, so
	 *  `aria-activedescendant` stays reactive. A table without `focusableRows`
	 *  is a plain table and gets nothing: its ring never leaves `inert`, so the
	 *  handlers would have nothing to do. */
	function gridAttributes(): ReturnType<GridFocus<Data>["gridAttributes"]> {
		if (props.focusableRows !== true) return {};
		const id = ringRowId();
		// Only a row that exists: a released pin can leave a departed id behind.
		const activeId = rowById(id) ? id : undefined;
		return {
			ref: (el: HTMLTableElement) => {
				gridRef = el;
			},
			[TABLE_GRID_ATTR]: "",
			tabIndex: 0,
			"aria-activedescendant":
				activeId !== undefined ? domIdFor(activeId) : undefined,
			onKeyDown: handleGridKeyDown,
			onFocusOut: (event) => {
				setFocusWithin(
					event.relatedTarget instanceof Node &&
						event.currentTarget.contains(event.relatedTarget)
				);
			},
		};
	}

	return { gridAttributes, isRowFocused, rowDomId };
}
