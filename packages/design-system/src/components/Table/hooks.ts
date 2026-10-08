import {
	createSolidTable,
	getCoreRowModel,
	getSortedRowModel,
	getFilteredRowModel,
	type SortingState,
	type ColumnFiltersState,
	type RowSelectionState,
	type FilterFn,
} from "@tanstack/solid-table";
import { createSignal } from "solid-js";

import {
	numberEqualsColumnFilter,
	enumIncludesColumnFilter,
	textContainsColumnFilter,
	dateRangeColumnFilter,
} from "./filter.ts";
import type { JfColumnDef } from "./types.ts";

/**
 * Assign a `filterFn` and `meta` (carrying `dataType`/`enumOptions`) to each
 * column based on its J floor `dataType`. Ported from EmboUI's
 * `useTableConfiguration`; the `auto` filter default does not do
 * case-insensitive substring matching for strings, so we wire it explicitly.
 */
function processColumns<Data extends Record<string, unknown>>(
	columns: JfColumnDef<Data>[]
): JfColumnDef<Data>[] {
	return columns.map((column): JfColumnDef<Data> => {
		switch (column.dataType) {
			case "number":
				return {
					...column,
					filterFn: numberEqualsColumnFilter as FilterFn<Data>,
					meta: { ...column.meta, dataType: column.dataType },
				};
			case "enum":
				return {
					...column,
					filterFn: enumIncludesColumnFilter as FilterFn<Data>,
					meta: {
						...column.meta,
						dataType: column.dataType,
						enumOptions: column.enumOptions,
					},
				};
			case "date":
				return {
					...column,
					filterFn: dateRangeColumnFilter as FilterFn<Data>,
					meta: { ...column.meta, dataType: column.dataType },
				};
			case "string":
				return {
					...column,
					filterFn: textContainsColumnFilter as FilterFn<Data>,
					meta: { ...column.meta, dataType: column.dataType },
				};
			default:
				return {
					...column,
					meta: { ...column.meta, dataType: column.dataType },
				};
		}
	});
}

export type CreateTableOptions<Data extends Record<string, unknown>> = {
	data: () => Data[];
	columns: JfColumnDef<Data>[];
	initialSorting?: SortingState;
	initialFilters?: ColumnFiltersState;
	enableRowSelection?: boolean;
	groupBy?: string;
};

/**
 * Build a `@tanstack/solid-table` instance with signal-backed sorting,
 * filtering and row selection. Columns are processed to carry `filterFn`/`meta`
 * from their `dataType`.
 *
 * Grouping is NOT native (`getGroupedRowModel`): `Table.Root` renders groups as
 * an accordion of subtables over the flat, sorted+filtered row model. The
 * grouped column is hidden via `columnVisibility` (its value becomes each
 * group's accordion header), and group order follows that column's sort.
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

	const processedColumns = processColumns(opts.columns);
	// Prepend a display-only "select" column when row selection is enabled. It is
	// rendered specially (checkboxes) by `Table.Root`; it carries no accessor.
	const allColumns: JfColumnDef<Data>[] = opts.enableRowSelection
		? [
				{
					id: "select",
					enableSorting: false,
					enableColumnFilter: false,
					dataType: "boolean",
				},
				...processedColumns,
			]
		: processedColumns;

	const table = createSolidTable<Data>({
		get data() {
			return opts.data();
		},
		columns: allColumns,
		// Default column width (px) for the grouped accordion's fixed colgroup;
		// columns override via `size`. Unused by the auto-layout flat table.
		defaultColumn: { size: 160 },
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
			// Hide the grouped column: its value is shown in the group's accordion
			// header instead of as a redundant data column.
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
