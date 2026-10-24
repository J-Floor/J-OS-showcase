import type {
	ColumnFiltersState,
	Row as TanRow,
	RowSelectionState,
	SortingState,
	TableOptions,
	Table as TanTable,
} from "@tanstack/solid-table";
import clsx from "clsx";
import { type Accessor, type JSX, createEffect } from "solid-js";

import {
	BatchActions,
	SelectionProvider,
	useSelection,
} from "./BatchActions.tsx";
import { createColumnLayout, createTracksSettled } from "./columnLayout.ts";
import { Empty, emptyPart } from "./Empty.tsx";
import { createGridFocus } from "./gridFocus.ts";
import { createTable } from "./hooks.ts";
import { createRangeSelection } from "./rangeSelection.ts";
import {
	createRenderItems,
	createRowGroups,
	type RenderItem,
} from "./rowGroups.ts";
import styles from "./Table.module.scss";
import { type BodyContext, TableBody } from "./TableBody.tsx";
import { TableHead } from "./TableHead.tsx";
import type { JfColumnDefinition } from "./types.ts";
import { createRowVirtualizer, createScrollParent } from "./virtualRows.ts";

export type TableRootProps<Data extends Record<string, unknown>> = {
	columns: JfColumnDefinition<Data>[];
	/** The rows, or `undefined` while they are still loading. A loading table
	 *  renders its header and skeleton rows. */
	data: Data[] | undefined;
	/** Force the loading skeleton even when `data` is defined. */
	loading?: boolean;
	/** Append skeleton rows after the last row while the next page loads.
	 *  Ignored while `loading`: the first-load skeleton covers the body. With
	 *  zero rows the empty row shows and no skeleton rows render. */
	loadingMore?: boolean;
	initialColumnSorting?: SortingState;
	initialColumnFilters?: ColumnFiltersState;
	/** Group rows natively by this column id. */
	groupBy?: string;
	/** Enable a leading selection column + tri-state select-all. */
	enableRowSelection?: boolean;
	/**
	 * A row's stable id (TanStack's `row.id`), keying its selection, its
	 * column measurement, its focus (`activeRowId`, `aria-activedescendant`)
	 * and the detail view it morphs into. Ids must be unique: two rows
	 * sharing one share all of these. Required: an index would hand a row's
	 * selection, focus and width to another row when one is inserted above
	 * it. Only data that never changes may key rows by index.
	 */
	getRowId: NonNullable<TableOptions<Data>["getRowId"]>;
	/** Make the header stick to the top on scroll. @default true */
	stickyHeader?: boolean;
	/**
	 * Mark each row's first visible column (after the selection column) as its
	 * row header, so screen readers name the row by it. @default false
	 */
	headerColumn?: boolean;
	/**
	 * Render only the rows near the viewport, with spacer rows standing in for
	 * the rest. Off by default — it costs a scroll listener and per-row
	 * measurement, which a twenty-row table does not need.
	 *
	 * Turn it on where a row is expensive rather than where rows are merely
	 * numerous: a table whose cells are plain text copes with hundreds of rows,
	 * while one with a picker and three icon buttons per row does not. Requires
	 * `groupBy` (the ungrouped branch is unvirtualised).
	 */
	virtualize?: boolean;
	/**
	 * Called when the rendered window comes within
	 * `END_REACHED_THRESHOLD_ROWS` (virtualRows.ts) rows of the last row, which includes a table
	 * whose rows do not fill its scroll box. For loading more rows as the user
	 * nears the end.
	 *
	 * Fires once per row count: it re-arms when the number of rows changes, or
	 * when the window scrolls back out of that zone and returns. Sitting at the
	 * end with the same rows never fires it twice. It also waits while
	 * `loadingMore` is true, and fires again when `loadingMore` clears at the
	 * end, even with the same rows: a page that came back empty still asks
	 * for the next. A caller whose page failed should not retry from here, or
	 * it loops while offline.
	 *
	 * Virtualised tables only (`virtualize` + `groupBy`, inside a bounded scroll
	 * box). It reads the virtualiser's window, so an unvirtualised table, or
	 * one with no height to window against, never calls it.
	 */
	onEndReached?: () => void;
	onRowClick?: (row: Data, event: MouseEvent) => void;
	/** Called when a mouse or pen pointer has rested on a row for
	 * `HOVER_INTENT_MS` (utils/hoverIntent.ts); a hover-intent hook for warming
	 * the data behind it. Leaving sooner cancels
	 * it, so sweeping across rows fires none. A touch is a tap, not intent, so
	 * it is ignored. Passes the row's original data object. */
	onRowHoverIntent?: (row: Data) => void;
	/** Called whenever the set of on-screen (displayed) rows changes, in render order.
	 * Passes the original data objects so consumers can navigate the visible list. */
	onDisplayedRowsChange?: (rows: Data[]) => void;
	/**
	 * Called whenever the checked-row selection changes. Passes the original
	 * data objects, empty when nothing is checked.
	 *
	 * For using the selection outside the table. Anything among the table's
	 * children (a `Table.BatchActions` bar's actions) reads it with
	 * `Table.useSelection` instead.
	 */
	onSelectedRowsChange?: (rows: Data[]) => void;
	/**
	 * Opt into keyboard row focus. The table becomes a focusable grid, and while
	 * it has focus ↑/↓ move a focus ring row to row and Enter activates. Keys
	 * pressed elsewhere on the page never reach it. Off by default — a read-only
	 * table has nothing to activate.
	 */
	focusableRows?: boolean;
	/**
	 * Put the ring on the first row as soon as there is one, instead of waiting
	 * for the first ↑/↓. For a work queue you land on ready to act; a plain
	 * data table would rather open with nothing selected, so this is off by
	 * default and only meaningful alongside `focusableRows`.
	 */
	autofocusFirstRow?: boolean;
	/**
	 * Clear and disable the row-focus ring while true. For when something else owns
	 * the keyboard and the row it acts on — an open detail view, say: a ring
	 * left glowing under it would claim a row is the target when the view is, and
	 * Enter would reopen it stacked on top. Mutually exclusive with the ring the
	 * same way a checkbox selection is.
	 */
	suppressFocus?: boolean;
	/**
	 * Pin the ring to a specific row by its id (see `getRowId`) — the row an
	 * open detail view is showing — so the table stays visually in sync as the
	 * view pages row to row, and that row is scrolled into view. Shown but NOT
	 * interactive: a pinned ring is inert, so arrows and Enter do nothing while
	 * it is pinned (the view owns them), whether or not `suppressFocus` is
	 * set. When the pin releases (`undefined`), the ring stays where it landed,
	 * so closing the view leaves you on that row. Accessor so it stays live.
	 */
	activeRowId?: () => string | undefined;
	/** The row the focus ring is on, or `undefined` when it is nowhere. */
	onFocusedRowChange?: (row: Data | undefined) => void;
	/** Enter on the focused row. */
	onRowActivate?: (row: Data) => void;
	/**
	 * Hands the consumer a small focus API. Call `advance()` after an action
	 * resolves: focus moves to whichever row now occupies the index the acted-on
	 * row held, so triaging the top of a queue walks you down it.
	 */
	focusApi?: (api: { advance: () => void }) => void;
	class?: string;
	/** Parts (`Table.BatchActions`, `Table.Empty`) and anything else, rendered
	 *  below the table. `Table.Empty` renders in the body instead. */
	children?: JSX.Element;
};

/**
 * Focus and a checkbox selection are mutually exclusive. Checking anything
 * means the keys act on the selection, and a focus ring left on screen
 * beside it would claim otherwise.
 */
function hasCheckedRows(rowSelection: RowSelectionState): boolean {
	return Object.values(rowSelection).some(Boolean);
}

/** Tells the consumer which rows are on screen and which are checked. */
function reportRows<Data extends Record<string, unknown>>(options: {
	props: Pick<
		TableRootProps<Data>,
		"onDisplayedRowsChange" | "onSelectedRowsChange"
	>;
	table: TanTable<Data>;
	displayedLeafRows: () => TanRow<Data>[];
}): void {
	const { props, table, displayedLeafRows } = options;
	createEffect(() => {
		props.onDisplayedRowsChange?.(
			displayedLeafRows().map((row) => row.original)
		);
	});

	createEffect(() => {
		props.onSelectedRowsChange?.(
			table.getSelectedRowModel().rows.map((row) => row.original)
		);
	});
}

/**
 * The table's rows as a model: the TanStack table, its grouping, the focus
 * ring, checkbox selection, the consumer's row reports and the virtual
 * body's render items. Created in this order: the ring's memo reads the
 * displayed rows as it is created, so grouping comes first.
 */
function createTableModel<Data extends Record<string, unknown>>(
	props: TableRootProps<Data>
) {
	const { table, rowSelection, setRowSelection } = createTable<Data>({
		data: () => props.data ?? [],
		// columns/enableRowSelection/groupBy are table config read once at setup
		// (createTable only takes `data` as a reactive getter); they are static per
		// Table instance, so reading them eagerly here is intentional.
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		columns: props.columns,
		initialColumnSorting: props.initialColumnSorting,
		initialColumnFilters: props.initialColumnFilters,
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		enableRowSelection: props.enableRowSelection,
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		groupBy: props.groupBy,
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		getRowId: props.getRowId,
	});

	const groups = createRowGroups({ props, table });

	const focus = createGridFocus({
		props,
		/**
		 * The rows the focus ring can land on, IN THE ORDER THEY RENDER —
		 * grouped and group-ordered, collapsed groups excluded (see
		 * `displayedLeafRows`), not the flat sorted model.
		 *
		 * The two diverge the moment `groupBy` is set: the flat model is
		 * ordered by the column sort (e.g. score desc), while the screen is
		 * bucketed by group in the grouped column's own order. Walking the flat
		 * model made ArrowDown jump between groups and stranded the first
		 * visual group's rows at the very end of the traversal — a group at
		 * the top of the screen whose rows sort last could not be reached by
		 * arrowing down from the top. Walking the displayed order is what
		 * makes the ring move the way the eye reads.
		 */
		rows: groups.displayedLeafRows,
		rowId: (row) => row.id,
		selectionActive: () => hasCheckedRows(rowSelection()),
	});

	const selection = createRangeSelection({
		rows: groups.displayedLeafRows,
		setRowSelection,
	});

	reportRows({ props, table, displayedLeafRows: groups.displayedLeafRows });

	const renderItems = createRenderItems(groups);

	return { table, rowSelection, groups, focus, selection, renderItems };
}

/**
 * Where the rows meet the screen: the scroll parent, the column layout, when
 * track changes may animate, and the virtualiser. Created in this order: the
 * scroll parent's `onMount` seeds the height the layout's re-measure and the
 * virtualiser read.
 */
function createTableViewport<Data extends Record<string, unknown>>(options: {
	props: TableRootProps<Data>;
	table: TanTable<Data>;
	renderItems: Accessor<RenderItem<Data>[]>;
	loading: () => boolean;
}) {
	const { props, table, renderItems, loading } = options;
	let tableReference: HTMLTableElement | undefined;
	let bodyReference: HTMLTableSectionElement | undefined;

	const scroll = createScrollParent();

	const layout = createColumnLayout({
		table,
		tableEl: () => tableReference,
		focusableRows: () => props.focusableRows === true,
		scrollParentHeight: scroll.scrollParentHeight,
	});

	const haveTracksSettled = createTracksSettled({
		loading,
		hidden: scroll.hidden,
	});

	const rows = createRowVirtualizer({
		props,
		scroll,
		renderItems,
		body: () => bodyReference,
		loading,
	});

	return {
		scroll,
		layout,
		haveTracksSettled,
		rows,
		tableRef: (element: HTMLTableElement) => {
			tableReference = element;
		},
		bodyRef: (element: HTMLTableSectionElement) => {
			bodyReference = element;
		},
	};
}

/**
 * Data table built on `@tanstack/solid-table`. Renders header (sorting +
 * filtering), body (leaf rows, group header rows when `groupBy` is set),
 * optional selection column and a `Table.BatchActions` bar.
 *
 * Layout: the table, its head and its body are blocks, and every row is its
 * own CSS grid over ONE shared track list (`--jf-table-tracks`), so header,
 * group header and body rows line up on the same tracks. Rows keep their
 * boxes, which the virtualiser measures, the focus ring paints and the pad
 * rows size. Column widths come from each column's `size` (see
 * `ColumnSize`); content-sized ones are measured (see `columnLayout.ts`).
 *
 * Ported from EmboUI's `Table`, which puts every cell in one grid on the
 * `<table>` with `display: contents` rows. Not ported: a row with no box
 * cannot be measured, windowed or ringed.
 */
export function Root<Data extends Record<string, unknown>>(
	props: TableRootProps<Data>
): JSX.Element {
	function stickyHeader(): boolean {
		return props.stickyHeader ?? true;
	}

	function loading(): boolean {
		return props.loading === true || props.data === undefined;
	}

	const model = createTableModel(props);
	const { table, focus } = model;
	const viewport = createTableViewport({
		props,
		table,
		renderItems: model.renderItems,
		loading,
	});
	const { layout } = viewport;

	const body: BodyContext<Data> = {
		props,
		table,
		groups: model.groups,
		focus,
		selection: model.selection,
		rowId: (row) => row.id,
		loading,
		scroll: viewport.scroll,
		renderItems: model.renderItems,
		rows: viewport.rows,
	};

	return (
		<emptyPart.Scope>
			<div class={styles.tableWrapper}>
				{/* The scroll box: every table needs one, grouped or not, or it
			    clips inside `.tableWrapper` (overflow: clip) and cannot
			    scroll — rows past the fold and columns past the viewport are
			    simply cut off (phone especially). The box is what the sticky
			    header sticks to. */}
				<div class={styles.scrollBox} ref={viewport.scroll.ref}>
					<table
						ref={viewport.tableRef}
						class={clsx(styles.table, props.class)}
						role={props.focusableRows === true ? "grid" : "table"}
						{...focus.gridAttributes()}
						data-sticky-header={stickyHeader() ? "true" : "false"}
						data-animate-tracks={
							viewport.haveTracksSettled() ? "true" : undefined
						}
						style={{
							"--jf-table-tracks": layout().tracks,
							"--jf-table-floor": `${String(layout().floor)}px`,
							...layout().widths,
						}}
					>
						<TableHead table={table} />
						<tbody role="rowgroup" ref={viewport.bodyRef}>
							<TableBody context={body} />
						</tbody>
					</table>
				</div>
				<SelectionProvider
					table={table}
					rowSelection={model.rowSelection}
				>
					{props.children}
				</SelectionProvider>
			</div>
		</emptyPart.Scope>
	);
}

export const Table = {
	Root,
	BatchActions,
	Empty,
	useSelection,
};
