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
	type Table as TanTable,
} from "@tanstack/solid-table";
import {
	createComputed,
	createEffect,
	createMemo,
	createSignal,
	on,
} from "solid-js";

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
import type { TableRootProps } from "./Table.tsx";
import type {
	ColumnSize,
	DataType,
	EnumOption,
	EnumValue,
	JfColumnDefinition,
	NoDataType,
} from "./types.ts";

/**
 * What a processed column carries in its `meta`: its `dataType` arm, the
 * size the caller wrote (absent when they wrote none: TanStack merges its own
 * default size into every def, so the def alone cannot tell), and whether the
 * caller gave the column its own `cell` (TanStack merges a default one too).
 */
type TableColumnMeta = (DataType | NoDataType) & {
	size?: ColumnSize;
	customCell?: boolean;
};

/** A processed column's {@link TableColumnMeta}. */
export function columnMeta(column: {
	columnDef: { meta?: unknown };
}): TableColumnMeta {
	return columnDefinitionMeta(column.columnDef);
}

/** A processed column def's {@link TableColumnMeta}. */
export function columnDefinitionMeta(columnDefinition: {
	meta?: unknown;
}): TableColumnMeta {
	return (columnDefinition.meta as TableColumnMeta | undefined) ?? {};
}

function filterFunctionFor<Data extends Record<string, unknown>>(
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
	column: JfColumnDefinition<Data>
): ColumnDef<Data> {
	const { size, ...rest } = column;
	const filterFunction = filterFunctionFor<Data>(column.dataType);
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
		...(filterFunction ? { filterFn: filterFunction } : {}),
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
>(): JfColumnDefinition<Data> {
	return { id: SELECT_COLUMN_ID, size: SELECT_COLUMN_WIDTH };
}

/** A row value as a stringified enum value, or `undefined` for no value. */
function enumKey(value: unknown): string | undefined {
	return isEnumValue(value) && value !== "" ? String(value) : undefined;
}

/** The values a row cell holds: an array cell holds several. */
function cellEntries(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [value];
}

/** The row values of an enum column that no `enumOptions` entry covers. */
function unmatchedEnumValues(
	rows: readonly { getValue: (columnId: string) => unknown }[],
	columnId: string,
	enumOptions: readonly EnumOption<EnumValue>[]
): Set<string> {
	const known = new Set(
		enumOptions.flatMap((option) => enumOptionValues(option))
	);
	const unmatched = new Set<string>();
	for (const row of rows) {
		const entries = cellEntries(row.getValue(columnId));
		for (const entry of entries) {
			const key = enumKey(entry);
			if (key !== undefined && !known.has(key)) unmatched.add(key);
		}
	}
	return unmatched;
}

/** Warns once per enum column whose rows hold values its options miss. */
function warnEnumDrift<Data extends Record<string, unknown>>(
	table: TanTable<Data>,
	warned: Set<string>
): void {
	const rows = table.getCoreRowModel().rows;
	for (const column of table.getAllLeafColumns()) {
		const meta = columnMeta(column);
		if (meta.dataType !== "enum" || warned.has(column.id)) continue;
		const unmatched = unmatchedEnumValues(
			rows,
			column.id,
			meta.enumOptions
		);
		if (unmatched.size === 0) continue;
		warned.add(column.id);
		// eslint-disable-next-line no-console -- a warning for the developer, not the user
		console.warn(
			`Table: column "${column.id}" has row values that match no enumOptions entry: ${[
				...unmatched,
			]
				.map((value) => `"${value}"`)
				.join(", ")}. These rows cannot be reached through the filter.`
		);
	}
}

/** Warns, in development, when the actions column is not listed last. */
function warnMisplacedActionsColumn(columns: readonly { id?: string }[]): void {
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
}

/** `Table.Root`'s table config, with `data` as a getter (loading is
 *  `Table.Root`'s business). */
export type CreateTableOptions<Data extends Record<string, unknown>> = Pick<
	TableRootProps<Data>,
	| "columns"
	| "initialColumnSorting"
	| "initialColumnFilters"
	| "enableRowSelection"
	| "groupBy"
	| "getRowId"
> & { data: () => Data[] };

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
	options: CreateTableOptions<Data>
) {
	const [sorting, setSorting] = createSignal<SortingState>(
		options.initialColumnSorting ?? []
	);
	const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>(
		options.initialColumnFilters ?? []
	);
	const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});

	// Follows `options.columns`, so columns built from data (an enum filter's
	// options) update after mount. TanStack keys its row model on `data`
	// alone, so new columns rebuild the cells, never the rows.
	const columns = createMemo(() => {
		const processed = (
			options.enableRowSelection
				? [selectColumn<Data>(), ...options.columns]
				: options.columns
		).map((column) => processColumn(column));
		// The actions column renders pinned to the trailing edge, in the last
		// track, whatever its place in the list.
		warnMisplacedActionsColumn(processed);
		return processed;
	});

	const table = createSolidTable<Data>({
		get data() {
			return options.data();
		},
		get columns() {
			return columns();
		},
		getRowId: options.getRowId,
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
				return options.groupBy ? { [options.groupBy]: false } : {};
			},
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onRowSelectionChange: setRowSelection,
		enableRowSelection: options.enableRowSelection ?? false,
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
		warnEnumDrift(table, warnedEnumColumns);
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
