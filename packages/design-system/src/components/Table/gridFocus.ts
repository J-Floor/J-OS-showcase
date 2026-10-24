/**
 * Keyboard row focus for `Table.Root` with `focusableRows`: the focus ring
 * (see `ringMachine.ts` and `gridRing.ts`), the grid's own keys, claiming real
 * focus when the table becomes live, keys routed in from the document,
 * scrolling the ringed row into view, and reporting it through
 * `onFocusedRowChange`.
 */
import type { Row as TanRow } from "@tanstack/solid-table";
import { type JSX, onMount } from "solid-js";

import { TABLE_GRID_ATTR } from "../../utils/typingTarget.ts";

import {
	createGridElement,
	createRowDomIds,
	hasModifier,
	scrollRingRowIntoView,
} from "./gridFocusDom.ts";
import { createGridRing, type GridFocusProps } from "./gridRing.ts";

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

export function createGridFocus<Data extends Record<string, unknown>>(options: {
	props: GridFocusProps<Data>;
	/** The rows the ring can land on, in render order. */
	rows: () => TanRow<Data>[];
	/** The row's id: its `row.id`, from `getRowId`. */
	rowId: (row: TanRow<Data>) => string;
	/** Whether a checkbox selection owns the keys. */
	selectionActive: () => boolean;
}): GridFocus<Data> {
	const { props, rows, rowId } = options;

	const grid = createGridElement();
	const { domIdFor, rowDomId } = createRowDomIds(
		() => props.focusableRows,
		rowId
	);

	const {
		rowById,
		ringRowId,
		stampedRowId,
		ringLive,
		dispatch,
		setFocusWithin,
	} = createGridRing({ ...options, grid });

	/** Whether the focus ring is shown on this row. */
	function isRowFocused(row: TanRow<Data>): boolean {
		return rowId(row) === stampedRowId();
	}

	scrollRingRowIntoView(ringRowId, domIdFor);

	// `advance` moves the ring to whatever now occupies the index the focused
	// row held. Meant to be called after an action resolves and the acted-on row
	// has left this group.
	onMount(() => {
		props.focusApi?.({
			advance: () => {
				dispatch({ type: "advance" });
			},
		});
	});

	// The table owns its keys only while it holds real focus, and only when the
	// keystroke is aimed at the table itself: Enter on a button in a row, or a
	// key in a row's field, bubbles here with a different target and belongs to
	// that control. Keys pressed anywhere else on the page never arrive at all.
	function handleGridKeyDown(event: KeyboardEvent): void {
		if (
			event.target !== event.currentTarget ||
			hasModifier(event) ||
			!ringLive()
		)
			return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (rows().length === 0) return;
			event.preventDefault();
			dispatch({
				type: "arrow",
				delta: event.key === "ArrowDown" ? 1 : -1,
			});
			return;
		}
		if (event.key === "Enter") activateRingRow(event);
	}

	function activateRingRow(event: KeyboardEvent): void {
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
			ref: grid.set,
			[TABLE_GRID_ATTR]: "",
			tabIndex: 0,
			"aria-activedescendant":
				activeId === undefined ? undefined : domIdFor(activeId),
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
