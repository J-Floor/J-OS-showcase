import {
	createSolidTable,
	getCoreRowModel,
	getSortedRowModel,
	getFilteredRowModel,
	type ColumnDef,
	type SortingState,
	type CellContext,
	type ColumnFiltersState,
	type RowSelectionState,
	type FilterFn,
} from "@tanstack/solid-table";
import { createComputed, createEffect, createSignal, on } from "solid-js";

import {
	ACTIONS_COLUMN_ID,
	SELECT_COLUMN_ID,
	SELECT_COLUMN_WIDTH,
} from "./columnTracks.ts";
import {
	booleanEqualsColumnFilter,
	dateRangeColumnFilter,
	enumIncludesColumnFilter,
	enumCellText,
	enumOptionValues,
	isEnumValue,
	numberRangeColumnFilter,
	textContainsColumnFilter,
	timeRangeColumnFilter,
} from "./filter.ts";
import type { ColumnSize, DataType, JfColumnDef } from "./types.ts";

/**
 * What a processed column carries in its `meta`: its `dataType` arm, the
 * size the caller wrote (absent when they wrote none: TanStack merges its own
 * default size into every def, so the def alone cannot tell), and whether the
 * caller gave the column its own `cell` (TanStack merges a default one too).
 */
type TableColumnMeta = (
	| DataType
	| { readonly dataType?: undefined; readonly enumOptions?: never }
) & {
	size?: ColumnSize;
	customCell?: boolean;
};

/** A processed column's {@link TableColumnMeta}. */
export function columnMeta(column: {
	columnDef: { meta?: unknown };
}): TableColumnMeta {
	return columnDefMeta(column.columnDef);
}

/** A processed column def's {@link TableColumnMeta}. */
export function columnDefMeta(columnDef: { meta?: unknown }): TableColumnMeta {
	return (columnDef.meta as TableColumnMeta | undefined) ?? {};
}

function filterFnFor<Data extends Record<string, unknown>>(
	dataType: DataType["dataType"] | undefined
): FilterFn<Data> | undefined {
	switch (dataType) {
		case "string":
			return textContainsColumnFilter as FilterFn<Data>;
		case "number":
			return numberRangeColumnFilter as FilterFn<Data>;
		case "enum":
			return enumIncludesColumnFilter as FilterFn<Data>;
		case "date":
			return dateRangeColumnFilter as FilterFn<Data>;
		case "time":
			return timeRangeColumnFilter as FilterFn<Data>;
		case "boolean":
			return booleanEqualsColumnFilter as FilterFn<Data>;
		case undefined:
			return undefined;
	}
}

/**
 * Give a column the `filterFn` for its `dataType`, carry `dataType`,
 * `enumOptions` and the authored size in `meta`, and take `size` off the def
 * before TanStack sees it: TanStack's `size` is a number, ours is a
 * {@link ColumnSize}. Ported from EmboUI's `useTableInstance`; TanStack's
 * `auto` filter does not do case-insensitive substring matching for strings,
 * so every filter is wired explicitly.
 */
function processColumn<Data extends Record<string, unknown>>(
	column: JfColumnDef<Data>
): ColumnDef<Data> {
	const { size, ...rest } = column;
	const filterFn = filterFnFor<Data>(column.dataType);
	const enumOptions =
		column.dataType === "enum" ? { enumOptions: column.enumOptions } : {};
	// An enum shows its option labels unless the caller renders its own cell:
	// the same text its width is measured by.
	const enumCell =
		column.dataType === "enum" && column.cell === undefined
			? {
					cell: (info: CellContext<Data, unknown>) =>
						enumCellText(column.enumOptions, info.getValue()),
				}
			: {};
	return {
		...rest,
		...enumCell,
		...(filterFn ? { filterFn } : {}),
		meta: {
			...column.meta,
			dataType: column.dataType,
			...enumOptions,
			...(size === undefined ? {} : { size }),
			customCell: column.cell !== undefined,
		},
	};
}

/** The display-only leading column `Table.Root` renders as checkboxes. */
function selectColumn<
	Data extends Record<string, unknown>,
>(): JfColumnDef<Data> {
	return { id: SELECT_COLUMN_ID, size: SELECT_COLUMN_WIDTH };
}

/** A row value as a stringified enum value, or `undefined` for no value. */
function enumKey(value: unknown): string | undefined {
	return isEnumValue(value) && value !== "" ? String(value) : undefined;
}

export type CreateTableOptions<Data extends Record<string, unknown>> = {
	data: () => Data[];
	columns: JfColumnDef<Data>[];
	initialSorting?: SortingState;
	initialFilters?: ColumnFiltersState;
	enableRowSelection?: boolean;
	groupBy?: string;
	/** A row's stable id: see {@link defaultRowId}. Ids must be unique: two
	 *  rows with one id share a selection and a measured width. */
	getRowId?: (row: Data, index: number) => string;
};

/**
 * A row's `_id` when it is a string (every Convex document), else its index.
 * A stable id keeps a selection on its row, and lets the column measurement
 * skip unchanged rows, when a live push inserts or removes rows above it.
 */
export function defaultRowId(
	row: Record<string, unknown>,
	index: number
): string {
	return typeof row._id === "string" ? row._id : String(index);
}

/**
 * Build a `@tanstack/solid-table` instance with signal-backed sorting,
 * filtering and row selection. Columns are processed to carry `filterFn`/`meta`
 * from their `dataType`.
 *
 * Grouping is NOT native (`getGroupedRowModel`): `Table.Root` renders group
 * header rows over the flat, sorted+filtered row model. The grouped column is
 * hidden via `columnVisibility` (its value becomes each group's header), and
 * group order follows that column's `enumOptions`.
 *
 * Ported from EmboUI's `useTable`/`useTableLogic`. React→Solid: `useState` →
 * `createSignal`; state passed via getters + `onXChange`.
 */
export function createTable<Data extends Record<string, unknown>>(
	opts: CreateTableOptions<Data>
) {
	const [sorting, setSorting] = createSignal<SortingState>(
		opts.initialSorting ?? []
	);
	const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>(
		opts.initialFilters ?? []
	);
	const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});

	const columns = (
		opts.enableRowSelection
			? [selectColumn<Data>(), ...opts.columns]
			: opts.columns
	).map(processColumn);

	// The actions column renders pinned to the trailing edge, in the last
	// track, whatever its place in the list.
	const actionsIndex = columns.findIndex(
		(column) => column.id === ACTIONS_COLUMN_ID
	);
	if (
		import.meta.env.DEV &&
		actionsIndex !== -1 &&
		actionsIndex !== columns.length - 1
	) {
		// eslint-disable-next-line no-console -- a warning for the developer, not the user
		console.warn(
			`Table: the "${ACTIONS_COLUMN_ID}" column must be the last column; it renders in the last track wherever it is listed.`
		);
	}

	const table = createSolidTable<Data>({
		get data() {
			return opts.data();
		},
		columns,
		getRowId: opts.getRowId ?? defaultRowId,
		state: {
			get sorting() {
				return sorting();
			},
			get columnFilters() {
				return columnFilters();
			},
			get rowSelection() {
				return rowSelection();
			},
			// Hide the grouped column: its value is shown in the group's
			// header row instead of as a redundant data column.
			get columnVisibility() {
				return opts.groupBy ? { [opts.groupBy]: false } : {};
			},
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onRowSelectionChange: setRowSelection,
		enableRowSelection: opts.enableRowSelection ?? false,
		enableMultiSort: true,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
	});

	// A row a push removes takes its selection with it, so a count over the
	// selection state stays true and the row is not silently selected again
	// if it comes back. A computed, not an effect: nothing downstream reads a
	// selection with a gone row's key in it.
	createComputed(
		on(
			() => table.getCoreRowModel().rows,
			(rows) => {
				const selection = rowSelection();
				const present = new Set(rows.map((row) => row.id));
				const kept = Object.fromEntries(
					Object.entries(selection).filter(([id]) => present.has(id))
				);
				if (Object.keys(kept).length < Object.keys(selection).length)
					setRowSelection(kept);
			}
		)
	);

	// An enum column filters on the stringified row value, so a row value no
	// option covers is unreachable through the filter UI: the options and the
	// field have drifted apart. Reported once per column, against the rows
	// rather than the options (an option with no rows is a normal empty
	// category). A missing or empty value is no value, not drift. Ported from
	// EmboUI's `useTableInstance`, plus array-valued cells.
	const warnedEnumColumns = new Set<string>();
	createEffect(() => {
		if (!import.meta.env.DEV) return;
		const rows = table.getCoreRowModel().rows;
		for (const column of table.getAllLeafColumns()) {
			const meta = columnMeta(column);
			if (meta.dataType !== "enum" || warnedEnumColumns.has(column.id))
				continue;
			const known = new Set(meta.enumOptions.flatMap(enumOptionValues));
			const unmatched = new Set<string>();
			for (const row of rows) {
				const value = row.getValue(column.id);
				for (const entry of Array.isArray(value) ? value : [value]) {
					const key = enumKey(entry);
					if (key !== undefined && !known.has(key))
						unmatched.add(key);
				}
			}
			if (unmatched.size === 0) continue;
			warnedEnumColumns.add(column.id);
			// eslint-disable-next-line no-console -- a warning for the developer, not the user
			console.warn(
				`Table: column "${column.id}" has row values that match no enumOptions entry: ${[
					...unmatched,
				]
					.map((value) => `"${value}"`)
					.join(
						", "
					)}. These rows cannot be reached through the filter.`
			);
		}
	});

	return {
		table,
		sorting,
		setSorting,
		columnFilters,
		setColumnFilters,
		rowSelection,
		setRowSelection,
	};
}
