import type { Column } from "@tanstack/solid-table";

import { columnLabel } from "./columnLabel.ts";
import { filterIsActive } from "./filter.ts";
import { columnMeta } from "./hooks.ts";
import type { DataType, EnumOption, EnumValue } from "./types.ts";

/** One column's filter: what it filters, its value, and how to change it. */
export type ColumnFilterState = {
	dataType: () => DataType["dataType"] | undefined;
	enumOptions: () => readonly EnumOption<EnumValue>[] | undefined;
	header: () => string;
	filterValue: () => unknown;
	setFilter: (value: unknown) => void;
	clearFilter: () => void;
	isActive: () => boolean;
};

export function createColumnFilter<
	Data extends Record<string, unknown>,
>(props: { column: Column<Data> }): ColumnFilterState {
	function dataType(): DataType["dataType"] | undefined {
		return columnMeta(props.column).dataType;
	}
	function filterValue(): unknown {
		return props.column.getFilterValue();
	}
	function setFilter(value: unknown): void {
		props.column.setFilterValue(value);
	}
	return {
		dataType,
		enumOptions() {
			const meta = columnMeta(props.column);
			return meta.dataType === "enum" ? meta.enumOptions : undefined;
		},
		header() {
			return columnLabel(props.column);
		},
		filterValue,
		setFilter,
		clearFilter() {
			setFilter(undefined);
		},
		isActive() {
			return filterIsActive(dataType(), filterValue());
		},
	};
}
