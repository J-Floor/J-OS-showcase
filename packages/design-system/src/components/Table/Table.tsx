import {
	flexRender,
	type Cell as TanCell,
	type Column,
	type Header,
	type Row as TanRow,
	type SortingState,
	type ColumnFiltersState,
} from "@tanstack/solid-table";
import { createVirtualizer } from "@tanstack/solid-virtual";
import clsx from "clsx";
import {
	type JSX,
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	untrack,
} from "solid-js";
import { Dynamic } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { afterPaint } from "../../utils/afterPaint.ts";
import { Checkbox } from "../Checkbox/Checkbox.tsx";
import { Deferred } from "../Deferred/Deferred.tsx";
import { Icon } from "../Icon/Icon.tsx";

import { BatchActions } from "./BatchActions.tsx";
import { createColumnLayout } from "./columnLayout.ts";
import { ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./columnTracks.ts";
import { enumOptionLabel, enumOptionValues } from "./filter.ts";
import { FilteringButton } from "./FilteringButton.tsx";
import { createGridFocus } from "./gridFocus.ts";
import { columnMeta, createTable } from "./hooks.ts";
import { SkeletonRows } from "./SkeletonRows.tsx";
import { SortingButton } from "./SortingButton.tsx";
import styles from "./Table.module.scss";
import type { EnumOption, EnumValue, JfColumnDef } from "./types.ts";

export type TableRootProps<Data extends Record<string, unknown>> = {
	columns: JfColumnDef<Data>[];
	/** The rows, or `undefined` while they are still loading. A loading table
	 *  renders its header and skeleton rows. */
	data: Data[] | undefined;
	/** Force the loading skeleton even when `data` is defined. */
	loading?: boolean;
	initialColumnSorting?: SortingState;
	initialColumnFilters?: ColumnFiltersState;
	/** Group rows natively by this column id. */
	groupBy?: string;
	/** Enable a leading selection column + tri-state select-all. */
	enableRowSelection?: boolean;
	/**
	 * A row's stable id, keying its selection and its column measurement.
	 * Defaults to the row's `_id` when it is a string (every Convex
	 * document), else its index. Give one for other data whose rows can be
	 * inserted or removed. Ids must be unique: two rows sharing one share
	 * their selection, their focus and their measured width. The same id
	 * keys focus and `activeRowId`.
	 */
	getRowId?: (row: Data, index: number) => string;
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
	 * `END_REACHED_THRESHOLD_ROWS` rows of the last row, which includes a table
	 * whose rows do not fill its scroll box. For loading more rows as the user
	 * nears the end.
	 *
	 * Fires once per row count: it re-arms when the number of rows changes, or
	 * when the window scrolls back out of that zone and returns. Sitting at the
	 * end with the same rows never fires it twice.
	 *
	 * Virtualised tables only (`virtualize` + `groupBy`, inside a bounded scroll
	 * box). It reads the virtualiser's window, so an unvirtualised table, or
	 * one with no height to window against, never calls it.
	 */
	onEndReached?: () => void;
	onRowClick?: (row: Data, event: MouseEvent) => void;
	/** Called whenever the set of on-screen (displayed) rows changes, in render order.
	 * Passes the original data objects so consumers can navigate the visible list. */
	onDisplayedRowsChange?: (rows: Data[]) => void;
	/**
	 * Called whenever the checked-row selection changes. Passes the original
	 * data objects, empty when nothing is checked.
	 *
	 * A callback rather than something read out of a render prop: a consumer
	 * that wants the current selection as a plain signal (not just inside
	 * `Table.BatchActions`' children) would otherwise have to call its own
	 * setter from inside that render prop's body — which runs during Solid's
	 * render pass, so writing a signal there is a write-during-render, the same
	 * re-entrancy risk `onDisplayedRowsChange` exists to avoid for the row list.
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
	 * for the first ↑/↓. For a triage queue you land on ready to act; a plain
	 * data table would rather open with nothing selected, so this is off by
	 * default and only meaningful alongside `focusableRows`.
	 */
	autofocusFirstRow?: boolean;
	/**
	 * Clear and disable the row-focus ring while true. For when something else owns
	 * the keyboard and the person it acts on — an open detail drawer, say: a ring
	 * left glowing under it would claim a row is the target when the drawer is, and
	 * Enter would reopen it stacked on top. Mutually exclusive with the ring the
	 * same way a checkbox selection is.
	 */
	suppressFocus?: boolean;
	/**
	 * Pin the ring to a specific row by `_id` — the person an open detail drawer
	 * is showing — so the table stays visually in sync as the drawer pages
	 * person to person, and that row is scrolled into view. Shown but NOT
	 * interactive: a pinned ring is inert, so arrows and Enter do nothing while
	 * it is pinned (the drawer owns them), whether or not `suppressFocus` is
	 * set. When the pin releases (`undefined`), the ring stays where it landed,
	 * so closing the drawer leaves you on that row. Accessor so it stays live.
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
	/** `Table.BatchActions` is detected among children; other children render below. */
	children?: JSX.Element;
};

/** Roughly one line of text plus padding. Stands in for a row the virtualiser
 * has not measured yet, and for one it could only measure at zero height (see
 * `measureElement`). Mirrors `$row-height` in Table.module.scss, which sizes
 * the skeleton rows — change both together. */
const ESTIMATED_ROW_HEIGHT = 53;

const END_REACHED_THRESHOLD_ROWS = 10;

/** `aria-sort` for a header: its sort state, or nothing when it cannot sort. */
function ariaSort<Data extends Record<string, unknown>>(
	column: Column<Data>
): "ascending" | "descending" | "none" | undefined {
	if (!column.getCanSort()) return undefined;
	const sorted = column.getIsSorted();
	if (sorted === "asc") return "ascending";
	if (sorted === "desc") return "descending";
	return "none";
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

	const { table, rowSelection, setRowSelection } = createTable<Data>({
		data: () => props.data ?? [],
		// columns/enableRowSelection/groupBy are table config read once at setup
		// (createTable only takes `data` as a reactive getter); they are static per
		// Table instance, so reading them eagerly here is intentional.
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		columns: props.columns,
		initialSorting: props.initialColumnSorting,
		initialFilters: props.initialColumnFilters,
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		enableRowSelection: props.enableRowSelection,
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		groupBy: props.groupBy,
		// eslint-disable-next-line solid/reactivity -- static table config, read once at setup
		getRowId: props.getRowId,
	});

	/**
	 * The id focus and `activeRowId` match a row by: the same `row.id` that
	 * keys its selection (see `getRowId`). Without a `getRowId`, a row with
	 * no string `_id` has only its index, which a push can hand to another
	 * row, so it gets no id and is never focused (see `isRowFocused` in
	 * gridFocus.ts).
	 */
	function rowId(row: TanRow<Data>): string | undefined {
		if (props.getRowId !== undefined) return row.id;
		return typeof row.original._id === "string" ? row.id : undefined;
	}

	// Collapsed group keys. Groups start expanded (empty set); toggling a group
	// header adds/removes its key. Declared ahead of `createGridFocus`: the
	// ring's memo reads the displayed rows as it is created, and those depend on which
	// groups are collapsed.
	const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(
		new Set()
	);

	/**
	 * The rows the focus ring can land on, IN THE ORDER THEY RENDER — grouped and
	 * group-ordered, collapsed groups excluded (see `displayedLeafRows`), not the
	 * flat sorted model.
	 *
	 * The two diverge the moment `groupBy` is set: the flat model is ordered by
	 * the column sort (e.g. score desc), while the screen is bucketed by group in
	 * the grouped column's own order. Walking the flat model made ArrowDown jump
	 * between groups and stranded the first visual group's rows at the very end of
	 * the traversal — "To score" sits at the top of the screen but scores 0, so it
	 * sorted last and could not be reached by arrowing down from the top. Walking
	 * the displayed order is what makes the ring move the way the eye reads.
	 */
	function focusableRowModels(): TanRow<Data>[] {
		return displayedLeafRows();
	}

	/**
	 * Focus and a checkbox selection are mutually exclusive. Checking anything
	 * means the keys act on the selection, and a focus ring left on screen
	 * beside it would claim otherwise.
	 */
	function selectionActive(): boolean {
		return Object.values(rowSelection()).some(Boolean);
	}

	const { gridAttributes, isRowFocused, rowDomId } = createGridFocus({
		props,
		rows: focusableRowModels,
		rowId,
		selectionActive,
	});

	/** A focusable table is an ARIA grid, whose cells are `gridcell`s. */
	function cellRole(): "gridcell" | "cell" {
		return props.focusableRows === true ? "gridcell" : "cell";
	}

	function columnCount(): number {
		return table.getVisibleLeafColumns().length;
	}

	function hasActions(): boolean {
		return table
			.getVisibleLeafColumns()
			.some((column) => column.id === ACTIONS_COLUMN_ID);
	}

	/** The column whose cells are row headers: the first visible one after the
	 *  selection column, when `headerColumn` is on. */
	function rowHeaderColumnId(): string | undefined {
		if (props.headerColumn !== true) return undefined;
		return table
			.getVisibleLeafColumns()
			.find((column) => column.id !== SELECT_COLUMN_ID)?.id;
	}

	// Id of the last toggled leaf row, anchor for shift-click range selection.
	// Tracked by id (not `row.index`, which is the original data index): the
	// range must follow the *rendered* order so it stays contiguous under
	// sorting/grouping.
	let lastSelectedId: string | null = null;

	function toggleRangeTo(targetId: string) {
		// Range must follow the on-screen order. When grouped, rows render in
		// `rowGroups()` order (bucketed by group, ordered by the grouped column's
		// enumOptions) — NOT `getRowModel()`'s flat sorted order — and collapsed
		// groups are hidden, so walk the same visible-and-ordered list here or a
		// shift-range across groups skips/keeps the wrong rows.
		const rows = displayedLeafRows();
		const targetPos = rows.findIndex((r) => r.id === targetId);
		const anchorPos =
			lastSelectedId === null
				? targetPos
				: rows.findIndex((r) => r.id === lastSelectedId);
		if (targetPos === -1 || anchorPos === -1) return;
		const start = Math.min(anchorPos, targetPos);
		const end = Math.max(anchorPos, targetPos);
		const ids = rows.slice(start, end + 1).map((r) => r.id);
		setRowSelection((prev) => {
			const next = { ...prev };
			for (const id of ids) next[id] = true;
			return next;
		});
	}

	function handleRowClick(row: TanRow<Data>, event: MouseEvent) {
		if (props.onRowClick) props.onRowClick(row.original, event);
	}

	function renderHeaderCell(header: Header<Data, unknown>): JSX.Element {
		const column = header.column;
		const isSelect = column.id === SELECT_COLUMN_ID;
		const isActions = column.id === ACTIONS_COLUMN_ID;
		return (
			<th
				class={clsx(styles.th, isActions && styles.actionsCell)}
				role="columnheader"
				scope="col"
				aria-sort={ariaSort(column)}
				data-column-id={column.id}
			>
				<Show
					when={isSelect}
					fallback={
						<span class={styles.headerCell} data-header-cell="">
							<span
								class={styles.headerLabel}
								data-header-label=""
							>
								{flexRender(
									column.columnDef.header,
									header.getContext()
								)}
							</span>
							<span
								class={styles.headerActions}
								data-header-actions=""
							>
								<Show when={column.getCanSort()}>
									<SortingButton
										column={column}
										table={table}
									/>
								</Show>
								<Show when={column.getCanFilter()}>
									<FilteringButton column={column} />
								</Show>
							</span>
						</span>
					}
				>
					<span class={clsx(styles.headerCell, styles.selectCell)}>
						<Checkbox
							checked={
								table.getIsAllRowsSelected()
									? true
									: table.getIsSomeRowsSelected()
										? "indeterminate"
										: false
							}
							onCheckedChange={() => {
								table.toggleAllRowsSelected();
							}}
						/>
					</span>
				</Show>
			</th>
		);
	}

	function renderCell(
		cell: TanCell<Data, unknown>,
		row: TanRow<Data>
	): JSX.Element {
		const column = cell.column;
		const def = column.columnDef as JfColumnDef<Data>;
		const isSelect = column.id === SELECT_COLUMN_ID;
		const isActions = column.id === ACTIONS_COLUMN_ID;
		const isRowHeader = column.id === rowHeaderColumnId();
		// In a grouped table the grouping column's value is shown in the group
		// header row, so the leaf cell for that column is left blank to avoid a
		// redundant repeat.
		const isGroupedColumn = props.groupBy === column.id;
		return (
			<Dynamic
				component={isRowHeader ? "th" : "td"}
				role={isRowHeader ? "rowheader" : cellRole()}
				class={clsx(
					isSelect && styles.selectCell,
					isActions && styles.actionsCell
				)}
				data-column-id={column.id}
				data-text-cell={isSelect || isActions ? undefined : ""}
				data-disable-row-click={
					isSelect || def.disableRowClick ? "true" : undefined
				}
				onClick={(event: MouseEvent) => {
					if (def.disableRowClick || isSelect)
						event.stopPropagation();
				}}
			>
				<Show
					when={isSelect}
					fallback={
						<Show when={!isGroupedColumn} fallback={null}>
							{flexRender(
								column.columnDef.cell,
								cell.getContext()
							)}
						</Show>
					}
				>
					<Checkbox
						class={styles.selectCheckbox}
						checked={row.getIsSelected()}
						disabled={!row.getCanSelect()}
						disabledReason="This row can't be selected"
						onClick={(event) => {
							if (
								(event as MouseEvent).shiftKey &&
								lastSelectedId !== null
							) {
								event.preventDefault();
								toggleRangeTo(row.id);
								lastSelectedId = row.id;
							}
						}}
						onCheckedChange={() => {
							row.toggleSelected();
							lastSelectedId = row.id;
						}}
					/>
				</Show>
			</Dynamic>
		);
	}

	/** `measured` is supplied only by the virtual body, which needs each row to
	 *  report its height and carry its index. */
	function renderRow(
		row: TanRow<Data>,
		measured?: { index: number; ref: (el: HTMLTableRowElement) => void }
	): JSX.Element {
		return (
			<tr
				ref={measured?.ref}
				id={rowDomId(row)}
				role="row"
				data-index={measured?.index}
				class={clsx(props.onRowClick && styles.clickable)}
				data-state={row.getIsSelected() ? "selected" : undefined}
				data-focused={isRowFocused(row) ? "true" : undefined}
				onClick={(event) => {
					handleRowClick(row, event);
				}}
			>
				<For each={row.getVisibleCells()}>
					{(cell) => renderCell(cell, row)}
				</For>
			</tr>
		);
	}

	function HeadRow(): JSX.Element {
		return (
			<thead role="rowgroup">
				<For each={table.getHeaderGroups()}>
					{(headerGroup) => (
						<tr role="row">
							<For each={headerGroup.headers}>
								{(header) => renderHeaderCell(header)}
							</For>
						</tr>
					)}
				</For>
			</thead>
		);
	}

	type RowGroup = { key: string; value: unknown; rows: TanRow<Data>[] };

	/** The grouped column's enum options, which name and order the groups. */
	function groupOptions(): readonly EnumOption<EnumValue>[] | undefined {
		if (!props.groupBy) return undefined;
		const column = table.getColumn(props.groupBy);
		if (!column) return undefined;
		const meta = columnMeta(column);
		return meta.dataType === "enum" ? meta.enumOptions : undefined;
	}

	function groupLabel(value: unknown): string {
		return enumOptionLabel(groupOptions() ?? [], String(value));
	}

	// Bucket the flat, sorted+filtered rows by the grouped column's value. Group
	// ORDER follows the grouped column's `enumOptions` order (so it is stable and
	// independent of the row sort); unknown values fall back to first-seen order.
	function rowGroups(): RowGroup[] {
		const groupBy = props.groupBy;
		if (!groupBy) return [];
		const order: string[] = [];
		const byKey = new Map<string, RowGroup>();
		for (const row of table.getRowModel().rows) {
			const value = row.getValue(groupBy);
			const key = String(value);
			let group = byKey.get(key);
			if (!group) {
				group = { key, value, rows: [] };
				byKey.set(key, group);
				order.push(key);
			}
			group.rows.push(row);
		}
		const options = groupOptions();
		if (options) {
			const rank = new Map(
				options.flatMap((option, i) =>
					enumOptionValues(option).map((value) => [value, i] as const)
				)
			);
			order.sort(
				(a, b) =>
					(rank.get(a) ?? Number.POSITIVE_INFINITY) -
					(rank.get(b) ?? Number.POSITIVE_INFINITY)
			);
		}
		return order.map((k) => byKey.get(k)!);
	}

	// Grouped rows render in ONE table (header, group-header rows and data rows
	// share one track list), so the leading select column and the group
	// indicator line up inherently and the trailing actions column can be sticky.
	function isGroupExpanded(key: string): boolean {
		return !collapsedGroups().has(key);
	}
	function toggleGroup(key: string) {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	// Leaf rows in the exact order they render on screen: grouped + group-ordered
	// and excluding collapsed (hidden) groups, else the flat sorted model. Used by
	// shift-click range selection so the range matches what the user sees.
	function displayedLeafRows(): TanRow<Data>[] {
		if (props.groupBy) {
			return rowGroups()
				.filter((g) => isGroupExpanded(g.key))
				.flatMap((g) => g.rows);
		}
		return table.getRowModel().rows.filter((r) => !r.getIsGrouped());
	}

	createEffect(() => {
		props.onDisplayedRowsChange?.(
			displayedLeafRows().map((r) => r.original)
		);
	});

	createEffect(() => {
		props.onSelectedRowsChange?.(
			table.getSelectedRowModel().rows.map((r) => r.original)
		);
	});

	// --- virtualisation ---------------------------------------------------
	// Group headers and data rows are interleaved in ONE list so the virtualiser
	// measures what is actually on screen. Keeping them in separate lists (or
	// virtualising each group's rows independently) means the spacer heights and
	// the sticky header stop agreeing with each other as soon as a group is
	// collapsed.
	type RenderItem =
		| { kind: "group"; group: RowGroup }
		| { kind: "row"; row: TanRow<Data> };

	// Memoised so an item's identity is stable while nothing has changed. The
	// virtual body keys off that identity to decide when to re-render a row, so
	// rebuilding the array on every read would make every row re-render on
	// every tick.
	const renderItems = createMemo<RenderItem[]>(() => {
		const items: RenderItem[] = [];
		for (const group of rowGroups()) {
			items.push({ kind: "group", group });
			if (isGroupExpanded(group.key))
				for (const row of group.rows) items.push({ kind: "row", row });
		}
		return items;
	});

	let scrollRef: HTMLDivElement | undefined = undefined;
	let tableRef: HTMLTableElement | undefined = undefined;
	let bodyRef: HTMLTableSectionElement | undefined = undefined;
	function captureScrollRef(el: HTMLDivElement): void {
		scrollRef = el;
	}
	function captureTableRef(el: HTMLTableElement): void {
		tableRef = el;
	}
	function captureBodyRef(el: HTMLTableSectionElement): void {
		bodyRef = el;
	}

	/**
	 * The element that actually scrolls this table vertically. The design system
	 * does not know the app's layout — it may be a shell region several levels
	 * up, or the table's own scroll box — so find it rather than assume it.
	 *
	 * Starts AT `scrollRef`, not above it. That element carries the horizontal
	 * overflow, which makes it a scroll container in both axes; once a caller
	 * bounds its height it is the box the rows scroll in and the sticky header
	 * sticks to. Skipping it sent the virtualiser to measure the page region
	 * instead, so it windowed against a viewport the rows were no longer moving
	 * through.
	 */
	function findScrollParent(): HTMLElement | null {
		let node: HTMLElement | null = scrollRef ?? null;
		while (node) {
			const overflow = getComputedStyle(node).overflowY;
			if (overflow === "auto" || overflow === "scroll") return node;
			node = node.parentElement;
		}
		return null;
	}

	// Resolved once the wrapper is in the document; until then there is nothing
	// to walk up from. `onMount` runs before the browser paints, so the rows
	// below are never rendered twice on screen — the first pass is skipped, not
	// shown and replaced.
	const [scrollEl, setScrollEl] = createSignal<HTMLElement | null>(null);
	const [mounted, setMounted] = createSignal(false);

	/**
	 * The scroll parent's current inner height, tracked reactively so
	 * `virtualizing()` can react to it. Kept as a signal (not read via
	 * `el.clientHeight` at call time) because clientHeight is a plain DOM
	 * property — a Solid tracked scope reading it never subscribes, so the
	 * decision to virtualise would freeze at whatever value it saw on mount.
	 *
	 * That matters most for a table living inside an Ark tab panel: the panel
	 * is kept mounted between visits and hidden with `[hidden]` — clientHeight
	 * flips 0 ↔ real without any signal changing. Without a live subscription
	 * here, a table mounted while hidden stays in the un-virtualised fallback
	 * forever, and a table mounted while visible has no way to re-measure
	 * after a hide/show cycle (the blank-after-tab-switch state a previous
	 * `needsRemeasure` heuristic tried to patch after the fact). The column
	 * layout re-measures its headers off the same signal.
	 */
	const [scrollParentHeight, setScrollParentHeight] = createSignal(0);

	/** Whether the scroll parent has EVER had a height. Until then a hidden
	 *  table has nothing to window against, so it shows skeleton rows rather
	 *  than rendering everything. After that, a height of 0 means "hidden tab",
	 *  and the rendered window is frozen as-is (see `VirtualBody`). */
	const everVisible = createMemo<boolean>(
		(prev) => prev || scrollParentHeight() > 0,
		false
	);
	function hidden(): boolean {
		return scrollEl() !== null && scrollParentHeight() === 0;
	}

	onMount(() => {
		const el = findScrollParent();
		setScrollEl(el);
		setMounted(true);
		if (!el) return;
		// Seed the initial height before wiring the observer, so a browser
		// without `ResizeObserver` still virtualises a laid-out table (it just
		// won't react to later resizes) instead of falling back to render-all.
		setScrollParentHeight(el.clientHeight);
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			setScrollParentHeight(el.clientHeight);
		});
		observer.observe(el);
		onCleanup(() => {
			observer.disconnect();
		});
	});

	const layout = createColumnLayout({
		table,
		tableEl: () => tableRef,
		focusableRows: () => props.focusableRows === true,
		scrollParentHeight,
	});

	/**
	 * Track changes animate (`[data-animate-tracks]` in the stylesheet) only
	 * once the first layout with data has painted, so a table never animates
	 * in, not even one mounted in a hidden tab and shown later.
	 */
	const [tracksSettled, setTracksSettled] = createSignal(false);
	createEffect(() => {
		if (tracksSettled() || loading() || hidden()) return;
		onCleanup(afterPaint(() => setTracksSettled(true)));
	});

	function scrollParent(): HTMLElement | null {
		return scrollEl();
	}

	/**
	 * Whether to actually window the rows. Requires a scroll container to
	 * measure against — with no scrollable ancestor there is no viewport to
	 * compute a window from and every row would be culled, so rendering
	 * everything is the fallback for a table that is merely laid out
	 * unusually (jsdom, or an ancestor without `overflow: auto|scroll`).
	 *
	 * A scroll parent that has been visible before keeps virtualizing even
	 * once its height drops to 0 (a hidden tab panel). There is nothing to
	 * re-window against at that point, so `VirtualBody` freezes its rendered
	 * window exactly as it was rather than recomputing against a zero-size
	 * viewport — see `everVisible`/`hidden()` and the `items` memo in
	 * `VirtualBody`. Only a scroll parent that has NEVER been measured with a
	 * height falls back further, to skeleton rows (see the grouped body's
	 * `everVisible` guard) rather than render-all.
	 */
	function virtualizing(): boolean {
		if (!props.virtualize) return false;
		return scrollEl() !== null && everVisible();
	}

	const virtualizer = createVirtualizer({
		get count() {
			return virtualizing() ? renderItems().length : 0;
		},
		// `null` when opted out: the virtualiser then installs no scroll or
		// resize observer at all, so a table that does not want this pays
		// nothing for the code being here.
		getScrollElement: () => (virtualizing() ? scrollParent() : null),
		// Roughly one line of text plus padding. Wrong rows are re-measured on
		// mount via `measureElement`, so this only affects the first paint's
		// scrollbar length.
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		// Enough that a fast flick does not show blank rows, few enough that the
		// mounted-widget count stays a fraction of the table.
		overscan: 12,
		/**
		 * NEVER cache a zero.
		 *
		 * A row measured while nothing on screen has been laid out reports a
		 * height of 0 — which happens whenever this table is inside a container
		 * that mounts before it is shown. Ark's `Tabs` with `lazyMount` does
		 * exactly that: the panel is mounted, its rows render and measure, and
		 * only then is it revealed.
		 *
		 * A cached 0 is a trap the virtualiser cannot climb out of. A row of
		 * height 0 adds nothing to the total size, so the window never extends
		 * far enough to reach it, so it is never re-rendered, so it is never
		 * re-measured. The Members roster settled with its last four items
		 * pinned at 0: `count` was 19 but `getTotalSize()` was 784 — exactly the
		 * sum of the fifteen rows that HAD been measured — so the table ended at
		 * row fifteen with no spacer beneath it and nothing left to scroll to.
		 * Alumni and Kicked out simply were not on the page.
		 *
		 * Falling back to the estimate keeps the row in the total, so the window
		 * still reaches it, and the next measurement — taken once it is visible
		 * — replaces the estimate with the truth.
		 */
		measureElement: (el) => {
			const height = el.getBoundingClientRect().height;
			return height > 0 ? height : ESTIMATED_ROW_HEIGHT;
		},
		get scrollMargin() {
			// Distance from the top of the scroll container's content to the top
			// of the rows — the header and anything above the table. Without it
			// every row sits one header too high.
			if (!bodyRef) return 0;
			const parent = scrollParent();
			if (!parent) return 0;
			return (
				bodyRef.getBoundingClientRect().top -
				parent.getBoundingClientRect().top +
				parent.scrollTop
			);
		},
	});

	// The row count `onEndReached` last fired for; cleared when the window
	// leaves the end zone, so scrolling back in fires again.
	let endReachedCount: number | undefined;
	createEffect(() => {
		if (!props.onEndReached || !virtualizing() || hidden() || loading())
			return;
		const count = renderItems().length;
		const last = virtualizer.getVirtualItems().at(-1);
		if (count === 0 || !last) return;
		if (last.index < count - 1 - END_REACHED_THRESHOLD_ROWS) {
			endReachedCount = undefined;
			return;
		}
		if (endReachedCount === count) return;
		endReachedCount = count;
		untrack(() => props.onEndReached?.());
	});

	function loading(): boolean {
		return props.loading === true || props.data === undefined;
	}

	/** A row standing in for rows that are not rendered: no cells, just
	 *  height. The height is a custom property so the size stays in SCSS. */
	function PadRow(rowProps: { height: number }): JSX.Element {
		return (
			<tr
				aria-hidden="true"
				class={styles.padRow}
				style={{ "--jf-table-pad": `${String(rowProps.height)}px` }}
			/>
		);
	}

	/**
	 * The virtual window, with one pad row above and one below standing in
	 * for everything not rendered. Pads are `<tr>`s rather than a positioned
	 * container because the rows must stay real table rows — the shared track
	 * list, the sticky actions column and the group-header span all depend on
	 * it.
	 */
	function VirtualBody(): JSX.Element {
		// Frozen while `hidden()`: with the scroll parent at 0 height there is
		// nothing to window against, so re-reading the virtualiser would
		// collapse the window to nothing.
		//
		// `virtualizer.getVirtualItems()` is NOT a plain array — the solid
		// wrapper keeps it in a Solid store and updates it via `reconcile()`
		// (keyed by row index) on every internal recompute, including the one
		// triggered by the scroll parent's own resize-to-0. `reconcile` mutates
		// that store's array in place, so simply holding onto the reference
		// returned here would still collapse to empty the moment the store
		// recomputes — caching has to take its own copy of the *array*, not the
		// live store, to actually freeze. The per-item objects inside stay the
		// live store's own proxies (reconcile keeps their identity stable by
		// index), which is what lets `<For>` leave the already-mounted `<tr>`s
		// alone.
		//
		// Also freeze on RE-SHOW, not just while hidden: virtual-core's
		// `calculateRange` returns `[]` whenever the viewport's `outerSize` is
		// 0, so the store sits empty for the whole time the table is hidden.
		// On return, Table's own `ResizeObserver` fires and flips `hidden()`
		// false BEFORE the virtualiser has recomputed against the new size —
		// so the first read after a resize can still see the stale empty
		// store. Reading straight off `hidden()` alone would unmount every
		// row for that one frame (padTop/padBottom collapse to 0, forcing a
		// layout via the `scrollMargin` getter's `getBoundingClientRect`),
		// which is the exact freeze this code exists to prevent — just
		// retriggered on the way back in. Guarding on "the live store just
		// went empty while we know there ARE rows to render" catches that
		// frame regardless of which observer fires first, so this no longer
		// depends on Table's resize observer registering before the
		// virtualiser's.
		let lastItems: ReturnType<typeof virtualizer.getVirtualItems> = [];
		const items = createMemo(() => {
			const live = virtualizer.getVirtualItems();
			if (hidden() || (live.length === 0 && renderItems().length > 0)) {
				return lastItems;
			}
			lastItems = [...live];
			return lastItems;
		});
		function padTop(): number {
			return items()[0]
				? items()[0].start - virtualizer.options.scrollMargin
				: 0;
		}
		/**
		 * Height to reserve for the rows below the window. Read straight from
		 * `getTotalSize()` (measured rows + estimates for the rest), minus
		 * where the last rendered row ends — the exact amount of scroll left
		 * beneath the fold.
		 *
		 * `getTotalSize()` on `@tanstack/solid-virtual` is a Solid signal (see
		 * the wrapper's Proxy `handler.get` for `"getTotalSize"`) — reading it
		 * subscribes, so this recomputes as measurements land and the total
		 * grows. Trusting it keeps the scrollbar honest: the roster used to
		 * cut off at row fifteen because the bottom pad was estimated from a
		 * row count that shrank whenever a group collapsed but didn't account
		 * for the measured rows above.
		 */
		function padBottom(): number {
			const last = items().at(-1);
			if (!last) return 0;
			return Math.max(0, virtualizer.getTotalSize() - last.end);
		}
		return (
			<>
				<Show when={padTop() > 0}>
					<PadRow height={padTop()} />
				</Show>
				<For each={items()}>
					{(virtualRow) => {
						// Re-read by index rather than closing over the item:
						// sorting, filtering and collapsing all reshuffle the
						// list under a stable set of virtual indexes.
						function item(): RenderItem | undefined {
							return renderItems()[virtualRow.index];
						}
						// Every rendered row reports its real height back, so a
						// wrapped cell does not throw off the spacers.
						//
						// Two ordering problems, one fix. Solid runs a `ref`
						// callback when the element is created, BEFORE its
						// attributes are applied, so the virtualiser read
						// `data-index` back as null and warned on every row —
						// hence stamping it here. And measuring writes to the
						// virtualiser, which re-runs this very list: doing that
						// synchronously inside the render re-entered `For`
						// mid-update and blew up on a row that no longer
						// existed. The microtask lets the render finish first.
						function measure(el: HTMLTableRowElement): void {
							el.dataset.index = String(virtualRow.index);
							queueMicrotask(() => {
								if (el.isConnected)
									virtualizer.measureElement(el);
							});
						}
						// `keyed` is load-bearing. A plain `Show` runs its
						// callback ONCE, when the condition first turns truthy,
						// and never again while it merely changes from one
						// truthy value to another — so a row rendered here kept
						// its original cells forever. A door override changed on
						// the server, the query pushed a fresh row model, and
						// the table went on showing the old flag. `keyed`
						// re-renders whenever the item's identity changes, which
						// (given the memo above) is exactly when it should.
						return (
							<Show when={item()} keyed>
								{(resolved) => {
									// Narrowed before the branch: `Show`'s
									// `when` takes a value, not a predicate, so
									// testing `kind` inline would leave both
									// arms holding the union.
									const group =
										resolved.kind === "group"
											? resolved.group
											: undefined;
									const row =
										resolved.kind === "row"
											? resolved.row
											: undefined;
									return (
										<Show
											when={group}
											fallback={
												<Show when={row}>
													{(leaf) =>
														renderRow(leaf(), {
															index: virtualRow.index,
															ref: measure,
														})
													}
												</Show>
											}
										>
											{(header) => (
												<GroupHeaderRow
													group={header()}
													index={virtualRow.index}
													ref={measure}
												/>
											)}
										</Show>
									);
								}}
							</Show>
						);
					}}
				</For>
				<Show when={padBottom() > 0}>
					<PadRow height={padBottom()} />
				</Show>
			</>
		);
	}

	function GroupHeaderRow(rowProps: {
		group: RowGroup;
		index?: number;
		ref?: (el: HTMLTableRowElement) => void;
	}): JSX.Element {
		function expanded() {
			return isGroupExpanded(rowProps.group.key);
		}
		return (
			<tr
				ref={rowProps.ref}
				role="row"
				data-index={rowProps.index}
				class={styles.groupRow}
			>
				<td
					class={styles.groupCell}
					role={cellRole()}
					colSpan={columnCount()}
				>
					<button
						type="button"
						class={clsx(
							styles.groupToggle,
							props.enableRowSelection &&
								styles.groupToggleSelectable
						)}
						aria-expanded={expanded()}
						onClick={() => {
							toggleGroup(rowProps.group.key);
						}}
					>
						<span class={styles.groupIndicator}>
							<Icon>
								{expanded()
									? ICONS.collapseAll
									: ICONS.expandAll}
							</Icon>
						</span>
						<span>
							{groupLabel(rowProps.group.value)}{" "}
							<span class={styles.groupCount}>
								({rowProps.group.rows.length})
							</span>
						</span>
					</button>
				</td>
			</tr>
		);
	}

	function EmptyRow(): JSX.Element {
		return (
			<tr role="row">
				<td
					class={styles.empty}
					role={cellRole()}
					colSpan={columnCount()}
				>
					No results.
				</td>
			</tr>
		);
	}

	function FlatBody(): JSX.Element {
		return (
			<Show
				when={table.getRowModel().rows.length > 0}
				fallback={<EmptyRow />}
			>
				<For each={table.getRowModel().rows}>
					{(row) => renderRow(row)}
				</For>
			</Show>
		);
	}

	function GroupedBody(): JSX.Element {
		return (
			<Show when={rowGroups().length > 0} fallback={<EmptyRow />}>
				{/* A virtualising table renders nothing until it has found its
				    scroll container, which cannot happen before this element is
				    in the document. `onMount` runs before the browser paints, so
				    that first empty pass is skipped rather than shown — without
				    this guard the table would render every row once and then
				    immediately throw all but a screenful away, which is the
				    exact cost being avoided. */}
				<Show when={!props.virtualize || mounted()}>
					{/* A scroll parent that has NEVER been measured with a
					    height has nothing to window against — show skeleton rows
					    rather than render every row, which is what made a hidden
					    tab expensive. Once it has been visible, `virtualizing()`
					    stays true and `VirtualBody` freezes its window instead. */}
					<Show
						when={
							!(
								props.virtualize &&
								scrollEl() !== null &&
								!everVisible()
							)
						}
						fallback={
							<SkeletonRows
								columns={columnCount()}
								hasActions={hasActions()}
							/>
						}
					>
						<Show
							when={virtualizing()}
							fallback={
								<For each={rowGroups()}>
									{(group) => (
										<>
											<GroupHeaderRow group={group} />
											<Show
												when={isGroupExpanded(
													group.key
												)}
											>
												<For each={group.rows}>
													{(row) => renderRow(row)}
												</For>
											</Show>
										</>
									)}
								</For>
							}
						>
							<VirtualBody />
						</Show>
					</Show>
				</Show>
			</Show>
		);
	}

	return (
		<div class={styles.tableWrapper}>
			{/* The scroll box: every table needs one, grouped or not, or it
			    clips inside `.tableWrapper` (overflow: clip) and cannot
			    scroll — rows past the fold and columns past the viewport are
			    simply cut off (phone especially). The box is what the sticky
			    header sticks to. */}
			<div class={styles.scrollBox} ref={captureScrollRef}>
				<table
					ref={captureTableRef}
					class={clsx(styles.table, props.class)}
					role={props.focusableRows === true ? "grid" : "table"}
					{...gridAttributes()}
					data-sticky-header={stickyHeader() ? "true" : "false"}
					data-animate-tracks={tracksSettled() ? "true" : undefined}
					style={{
						"--jf-table-tracks": layout().tracks,
						"--jf-table-floor": `${String(layout().floor)}px`,
						...layout().widths,
					}}
				>
					<HeadRow />
					<tbody role="rowgroup" ref={captureBodyRef}>
						<Deferred
							hold={loading()}
							fallback={
								<SkeletonRows
									columns={columnCount()}
									hasActions={hasActions()}
								/>
							}
						>
							<Show when={props.groupBy} fallback={<FlatBody />}>
								<GroupedBody />
							</Show>
						</Deferred>
					</tbody>
				</table>
			</div>
			<BatchActions.Provider table={table} rowSelection={rowSelection}>
				{props.children}
			</BatchActions.Provider>
		</div>
	);
}

export const Table = {
	Root,
	BatchActions: BatchActions.Component,
};
