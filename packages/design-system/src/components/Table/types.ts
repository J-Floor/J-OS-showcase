import type { ColumnDef } from "@tanstack/solid-table";

/** A selectable option for an `enum` column's filter UI. */
export type EnumOption = {
	readonly label: string;
	readonly value: string;
};

/**
 * Per-column data-type descriptor. Drives the filter predicate and the filter
 * popover body. `enumOptions` is required (and only allowed) when
 * `dataType === "enum"`.
 */
export type DataType =
	| {
			readonly dataType: "string" | "number" | "boolean" | "date";
			readonly enumOptions?: never;
	  }
	| {
			readonly dataType: "enum";
			readonly enumOptions: readonly EnumOption[];
	  };

/**
 * A TanStack `ColumnDef` augmented with a J floor `dataType` (and, for enums,
 * `enumOptions`). `disableRowClick` opts a column's cells out of `onRowClick`.
 *
 * Ported from EmboUI's `CustomColumnDef` (`@tanstack/react-table` →
 * `@tanstack/solid-table`).
 */
export type JfColumnDef<
	Data extends Record<string, unknown>,
	Value = unknown,
> = ColumnDef<Data, Value> &
	DataType & {
		/**
		 * When true, clicking cells in this column will not trigger onRowClick.
		 * Useful for columns with interactive elements (buttons, inputs, etc.).
		 */
		disableRowClick?: boolean;
	};

/**
 * Grouping configuration for native TanStack grouping. `groupBy` is a column
 * id; `label` optionally formats the group header from the group value and its
 * row count.
 *
 * Deviation from EmboUI: EmboUI's `GroupConfig` used a predicate
 * (`groupBy: (row) => boolean`) feeding manual `applyMultipleGroupings`. The
 * J floor Table uses native `getGroupedRowModel`, so `groupBy` is a column id.
 */
export type GroupConfig<Data extends Record<string, unknown>> = {
	groupBy: keyof Data | string;
	label?: (params: { value: unknown; itemsCount: number }) => string;
};
