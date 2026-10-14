import type { ColumnSize, JfColumnDefinition } from "./types.ts";

type Row = { name: string; kind: "a" | "b"; count: number };

export const pixels: ColumnSize = 120;
export const content: ColumnSize = "content";
export const weight: ColumnSize = { weight: 2 };
export const floor: ColumnSize = { min: 200 };
export const floorAndWeight: ColumnSize = { min: 200, weight: 2 };
export const bounded: ColumnSize = { min: 120, max: 300 };
export const contentFloor: ColumnSize = { min: "content", weight: 2 };
export const contentBounded: ColumnSize = { min: "content", max: 300 };

// @ts-expect-error -- `max` needs `min`; a `weight` beside it would be dropped
export const cappedWeight: ColumnSize = { max: 300, weight: 1 };

// @ts-expect-error -- `max` needs `min`; alone it can collapse to 0
export const ceilingOnly: ColumnSize = { max: 300 };

// @ts-expect-error -- an empty object says nothing; omit `size` instead
export const empty: ColumnSize = {};

export const display: JfColumnDefinition<Row> = {
	id: "actions",
	header: "",
	size: 84,
};

export const boundEnum: JfColumnDefinition<Row> = {
	accessorKey: "kind",
	header: "Kind",
	dataType: "enum",
	enumOptions: [
		{ value: "a", label: "A" },
		{ value: ["a", "b"], label: "A or B" },
	],
};

export const derivedEnum: JfColumnDefinition<Row> = {
	id: "parity",
	header: "Parity",
	dataType: "enum",
	accessorFn: (row) => row.count % 2,
	enumOptions: [{ value: 0, label: "Even" }],
};

// @ts-expect-error -- "c" is not a value of `kind`
export const badEnum: JfColumnDefinition<Row> = {
	accessorKey: "kind",
	header: "Kind",
	dataType: "enum",
	enumOptions: [{ value: "c", label: "C" }],
};

// @ts-expect-error -- an accessor column needs a `dataType`
export const untyped: JfColumnDefinition<Row> = {
	accessorKey: "name",
	header: "Name",
};

export const minSize: JfColumnDefinition<Row> = {
	accessorKey: "name",
	header: "Name",
	dataType: "string",
	// @ts-expect-error -- a bound is part of `size` now
	minSize: 40,
};

export const nested: JfColumnDefinition<Row> = {
	id: "group",
	header: "Group",
	// @ts-expect-error -- nested header columns are not supported
	columns: [],
};
