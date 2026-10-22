/**
 * The state of a table's row-focus ring as Solid wiring: the ring itself (see
 * `ringMachine.ts`), the inputs that move it, whether focus is inside the
 * grid, and the row that is stamped and reported.
 */
import type { Row as TanRow } from "@tanstack/solid-table";
import {
	createEffect,
	createMemo,
	createSignal,
	on,
	untrack,
	type Accessor,
	type Setter,
} from "solid-js";

import {
	claimGridFocus,
	routeStrayKeys,
	type GridElement,
} from "./gridFocusDom.ts";
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

export type GridFocusProps<Data extends Record<string, unknown>> = Pick<
	TableRootProps<Data>,
	| "focusableRows"
	| "autofocusFirstRow"
	| "suppressFocus"
	| "activeRowId"
	| "onFocusedRowChange"
	| "onRowActivate"
	| "focusApi"
>;

export function createGridRing<Data extends Record<string, unknown>>(options: {
	props: GridFocusProps<Data>;
	rows: () => TanRow<Data>[];
	rowId: (row: TanRow<Data>) => string | undefined;
	selectionActive: () => boolean;
	grid: GridElement;
}): {
	rowById: (id: string | undefined) => TanRow<Data> | undefined;
	ringRowId: Accessor<string | undefined>;
	stampedRowId: Accessor<string | undefined>;
	ringLive: () => boolean;
	dispatch: (event: RingEvent) => void;
	setFocusWithin: Setter<boolean>;
} {
	const { props, rows, rowId, selectionActive, grid } = options;

	function rowById(id: string | undefined): TanRow<Data> | undefined {
		return id === undefined
			? undefined
			: rows().find((candidate) => rowId(candidate) === id);
	}

	function ringContext(): RingContext {
		return {
			rowIds: rows().map((row) => rowId(row)),
			autofocusFirstRow: props.autofocusFirstRow ?? false,
		};
	}

	/** Where the ring is and why: see `ringMachine.ts`. Held by id, not index, so
	 *  it survives the data changing under it (triage moves rows between groups). */
	const [ring, setRing] = createSignal<RingState>(INITIAL_RING);

	/** Whether arrows and Enter act on the ring. Not while a checkbox selection
	 *  owns the keys, a caller has suppressed it (an open sheet, an off-screen
	 *  tab), or a sheet pins it. */
	function ringLive(): boolean {
		return isLive(ring());
	}

	function dispatch(event: RingEvent): void {
		const next = step(ring(), event, untrack(ringContext));
		setRing(next.state);
		if (next.takeFocus) claimGridFocus(grid, ringLive);
	}

	// The ring is real-focus only. A row is stamped `data-focused` (and reported
	// through `onFocusedRowChange`) only while focus is somewhere within this
	// table, or while an open sheet pins it. With focus on a topbar button or a
	// filter, nothing is stamped, so the ring, the row-scoped letter shortcuts
	// and their chips all go quiet together instead of the ring promising keys
	// that no longer reach it. Focus INSIDE a row (the note input `N` opens)
	// still counts.
	const [focusWithin, setFocusWithin] = createSignal(false);

	/** Re-reads whether focus is inside the grid from the DOM. Chrome fires no
	 *  `focusout` when a focused node is simply removed (a virtualized row's note
	 *  input scrolling out, a collapsed group header), so `focusWithin` would
	 *  stay true with focus on `body` and the ring would keep showing. Called
	 *  from every document `focusin` and, in the capture phase, every keydown,
	 *  instead of polling. Capture, so it runs before any bubble-phase keydown
	 *  listener (the letter shortcuts) reads the ring's row. */
	function syncFocusWithin(): void {
		setFocusWithin(grid.contains(document.activeElement));
	}

	routeStrayKeys({
		grid,
		isLive: ringLive,
		isEnabled: () => props.focusableRows,
		syncFocusWithin,
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

	// The row that is stamped and reported: `ringRowId` while the ring is shown.
	const stampedRowId = createMemo(() =>
		focusWithin() || ring().kind === "pinned" ? ringRowId() : undefined
	);

	// Report the stamped row whenever it changes, including to `undefined`. Not
	// `defer`red: that would also skip the autofocused first row on mount.
	let reported: string | undefined;
	createEffect(
		on(stampedRowId, (id) => {
			if (id === reported) return;
			reported = id;
			props.onFocusedRowChange?.(rowById(id)?.original);
		})
	);

	return {
		rowById,
		ringRowId,
		stampedRowId,
		ringLive,
		dispatch,
		setFocusWithin,
	};
}
