/**
 * `Table.Root`'s body rows: a data row and its cells, a group's header row,
 * and the row shown when nothing matches.
 */
import { Key } from "@solid-primitives/keyed";
import type {
	Cell as TanCell,
	CellContext,
	Row as TanRow,
	Table as TanTable,
} from "@tanstack/solid-table";
import clsx from "clsx";
import { type Accessor, type JSX, Show, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { createHoverIntent } from "../../utils/hoverIntent.ts";
import { MORPH_KEY, MORPH_OF, MORPH_TITLE } from "../../utils/morphNames.ts";
import { Checkbox } from "../Checkbox/Checkbox.tsx";
import { Icon } from "../Icon/Icon.tsx";

import { ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./columnTracks.ts";
import { COLUMN_ID_ATTR, TEXT_CELL_ATTR } from "./domContract.ts";
import { EmptyContent } from "./Empty.tsx";
import type { GridFocus } from "./gridFocus.ts";
import { GROUP_KEY_ATTR, toggleGroupWithMotion } from "./groupMotion.ts";
import type { RangeSelection } from "./rangeSelection.ts";
import type { RowGroup, RowGroups } from "./rowGroups.ts";
import styles from "./Table.module.scss";
import type { TableRootProps } from "./Table.tsx";
import type { JfColumnDefinition } from "./types.ts";

/** What a body row reads from the table it renders in. */
export type RowContext<Data extends Record<string, unknown>> = {
	props: TableRootProps<Data>;
	table: TanTable<Data>;
	groups: RowGroups<Data>;
	focus: Pick<GridFocus<Data>, "isRowFocused" | "rowDomId">;
	selection: RangeSelection<Data>;
	/** The id a row is matched by (focus, and the detail view that closes
	 *  into it): its `row.id`. */
	rowId: (row: TanRow<Data>) => string;
};

/** A focusable table is an ARIA grid, whose cells are `gridcell`s. */
function cellRole<Data extends Record<string, unknown>>(
	context: RowContext<Data>
): "gridcell" | "cell" {
	return context.props.focusableRows === true ? "gridcell" : "cell";
}

export function columnCount<Data extends Record<string, unknown>>(
	table: TanTable<Data>
): number {
	return table.getVisibleLeafColumns().length;
}

export function hasActions<Data extends Record<string, unknown>>(
	table: TanTable<Data>
): boolean {
	return table
		.getVisibleLeafColumns()
		.some((column) => column.id === ACTIONS_COLUMN_ID);
}

/** The first visible column that shows text: not the selection or actions
 *  column, nor an editable one (`disableRowClick`). Its cells are the row's
 *  title: row headers when `headerColumn` is on, and the text that flies
 *  into a sheet's title when the row morphs into one. Read reactively, so it
 *  moves on when a column is hidden. */
function titleColumnId<Data extends Record<string, unknown>>(
	context: RowContext<Data>
): string | undefined {
	return context.table.getVisibleLeafColumns().find((column) => {
		const definition = column.columnDef as JfColumnDefinition<Data>;
		return (
			column.id !== SELECT_COLUMN_ID &&
			column.id !== ACTIONS_COLUMN_ID &&
			definition.disableRowClick !== true
		);
	})?.id;
}

/** Wraps a cell's content so a morph can pair it with the sheet value
 *  showing the same field. The content, not the cell: the cell's padding
 *  would make the two ends of a flight hold the line at different heights,
 *  so the text would show twice at two sizes. The title cell's content
 *  flies on its own, as the title; it still carries its column id, so a
 *  detail view that shows that field apart from its title takes it there
 *  instead. */
function MorphContent(props: {
	columnId: string;
	isTitle: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<span
			class={props.isTitle ? styles.morphTitle : styles.morphValue}
			{...{
				get [MORPH_TITLE]() {
					return props.isTitle ? props.columnId : undefined;
				},
				get [MORPH_KEY]() {
					return props.isTitle ? undefined : props.columnId;
				},
			}}
		>
			{props.children}
		</span>
	);
}

/** A cell's render context that reads the latest `Cell` and `Row` on every
 *  access: the content is rendered once and follows refreshes through it. */
function liveCellContext<Data extends Record<string, unknown>>(
	context: RowContext<Data>,
	cell: Accessor<TanCell<Data, unknown>>,
	row: Accessor<TanRow<Data>>
): CellContext<Data, unknown> {
	return {
		get cell() {
			return cell();
		},
		get column() {
			return cell().column;
		},
		get row() {
			return row();
		},
		table: context.table,
		getValue: <Value,>() => cell().getValue<Value>(),
		renderValue: <Value,>() => cell().renderValue<Value>(),
	};
}

function renderCell<Data extends Record<string, unknown>>(
	context: RowContext<Data>,
	cell: Accessor<TanCell<Data, unknown>>,
	row: Accessor<TanRow<Data>>
): JSX.Element {
	// Cells are keyed by column id, so the id is fixed for this cell; the
	// column and its definition are read through `cell()`, never kept.
	const columnId = cell().column.id;
	function definition(): JfColumnDefinition<Data> {
		return cell().column.columnDef as JfColumnDefinition<Data>;
	}
	const isSelect = columnId === SELECT_COLUMN_ID;
	const isActions = columnId === ACTIONS_COLUMN_ID;
	function isTitle(): boolean {
		return columnId === titleColumnId(context);
	}
	function isRowHeader(): boolean {
		return isTitle() && context.props.headerColumn === true;
	}
	// In a grouped table the grouping column's value is shown in the group
	// header row, so the leaf cell for that column is left blank to avoid a
	// redundant repeat.
	function isGroupedColumn(): boolean {
		return context.props.groupBy === columnId;
	}
	function isRowClickOff(): boolean {
		return isSelect || definition().disableRowClick === true;
	}
	const live = liveCellContext(context, cell, row);
	const renderer = createMemo(() => definition().cell);
	// A refresh hands a new `Cell`; re-rendering a component cell for it would
	// replace a node a morph names, or the input that has focus. So the
	// renderer is called here, tracked, rather than through `flexRender`'s
	// component (which runs once, untracked): a renderer that reads `live` as
	// it runs (text, `formatDate(info.row.original.at)`) re-runs with the
	// refresh, and one that only hands `live` to JSX props renders once and
	// follows the refresh through them.
	function content(): JSX.Element {
		const render = renderer();
		return typeof render === "function"
			? (render(live) as JSX.Element)
			: render;
	}
	return (
		<Dynamic
			component={isRowHeader() ? "th" : "td"}
			role={isRowHeader() ? "rowheader" : cellRole(context)}
			class={clsx(
				isSelect && styles.selectCell,
				isActions && styles.actionsCell
			)}
			{...{
				[COLUMN_ID_ATTR]: columnId,
				[TEXT_CELL_ATTR]: isSelect || isActions ? undefined : "",
			}}
			data-disable-row-click={isRowClickOff() ? "true" : undefined}
			onClick={(event: MouseEvent) => {
				if (isRowClickOff()) event.stopPropagation();
			}}
		>
			<Show
				when={isSelect}
				fallback={
					<Show when={!isGroupedColumn()} fallback={null}>
						{/* The actions cell shows no value to pair. */}
						<Show when={!isActions} fallback={content()}>
							<MorphContent
								columnId={columnId}
								isTitle={isTitle()}
							>
								{content()}
							</MorphContent>
						</Show>
					</Show>
				}
			>
				<Checkbox
					class={styles.selectCheckbox}
					checked={row().getIsSelected()}
					disabled={!row().getCanSelect()}
					disabledReason="This row can't be selected"
					onClick={(event) => {
						context.selection.onCheckboxClick(row(), event);
					}}
					onCheckedChange={() => {
						context.selection.onCheckedChange(row());
					}}
				/>
			</Show>
		</Dynamic>
	);
}

/** What the virtual body hands a row: its index, and the ref through which
 *  it reports its height. */
export type MeasuredRow = {
	index: number;
	ref: (element: HTMLTableRowElement) => void;
};

/** `row` is an accessor so the `<tr>` outlives the refreshes that rebuild
 *  its `Row`; `measured` is supplied only by the virtual body. */
export function renderRow<Data extends Record<string, unknown>>(
	context: RowContext<Data>,
	row: Accessor<TanRow<Data>>,
	measured?: MeasuredRow
): JSX.Element {
	const { props, focus } = context;
	const hoverIntent = createHoverIntent(() => {
		props.onRowHoverIntent?.(row().original);
	});
	return (
		<tr
			ref={measured?.ref}
			id={focus.rowDomId(row())}
			role="row"
			data-index={measured?.index}
			class={clsx(props.onRowClick && styles.clickable)}
			data-state={row().getIsSelected() ? "selected" : undefined}
			data-focused={focus.isRowFocused(row()) ? "true" : undefined}
			{...{ [MORPH_OF]: context.rowId(row()) }}
			onPointerEnter={hoverIntent.onPointerEnter}
			onPointerLeave={hoverIntent.onPointerLeave}
			onClick={(event) => {
				if (props.onRowClick) props.onRowClick(row().original, event);
			}}
		>
			<Key each={row().getVisibleCells()} by={(cell) => cell.column.id}>
				{(cell) => renderCell(context, cell, row)}
			</Key>
		</tr>
	);
}

export function GroupHeaderRow<Data extends Record<string, unknown>>(
	rowProps: {
		context: RowContext<Data>;
		group: RowGroup<Data>;
	} & Partial<MeasuredRow>
): JSX.Element {
	function expanded() {
		return rowProps.context.groups.isGroupExpanded(rowProps.group.key);
	}
	return (
		<tr
			ref={rowProps.ref}
			role="row"
			data-index={rowProps.index}
			class={styles.groupRow}
			{...{ [GROUP_KEY_ATTR]: rowProps.group.key }}
		>
			<td
				class={styles.groupCell}
				role={cellRole(rowProps.context)}
				colSpan={columnCount(rowProps.context.table)}
			>
				<button
					type="button"
					class={clsx(
						styles.groupToggle,
						rowProps.context.props.enableRowSelection &&
							styles.groupToggleSelectable
					)}
					aria-expanded={expanded()}
					onClick={(event) => {
						const { groups } = rowProps.context;
						const key = rowProps.group.key;
						toggleGroupWithMotion(
							event.currentTarget.closest("tbody"),
							groups.isGroupExpanded(key),
							() => {
								groups.toggleGroup(key);
							}
						);
					}}
				>
					<span class={styles.groupIndicator}>
						<Icon>
							{expanded() ? ICONS.collapseAll : ICONS.expandAll}
						</Icon>
					</span>
					<span>
						{rowProps.context.groups.groupLabel(
							rowProps.group.value
						)}{" "}
						<span class={styles.groupCount}>
							({rowProps.group.rows.length})
						</span>
					</span>
				</button>
			</td>
		</tr>
	);
}

export function EmptyRow<Data extends Record<string, unknown>>(rowProps: {
	context: RowContext<Data>;
}): JSX.Element {
	return (
		<tr role="row">
			<td
				class={styles.empty}
				role={cellRole(rowProps.context)}
				colSpan={columnCount(rowProps.context.table)}
			>
				<div class={styles.emptyContent}>
					<EmptyContent table={rowProps.context.table} />
				</div>
			</td>
		</tr>
	);
}
