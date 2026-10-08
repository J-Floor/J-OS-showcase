import type { ColumnSize, JfColumnDef } from "./types.ts";

type Row = { name: string; kind: "a" | "b"; count: number };

const pixels: ColumnSize = 120;
const content: ColumnSize = "content";
const weight: ColumnSize = { weight: 2 };
const floor: ColumnSize = { min: 200 };
const floorAndWeight: ColumnSize = { min: 200, weight: 2 };
const bounded: ColumnSize = { min: 120, max: 300 };
const contentFloor: ColumnSize = { min: "content", weight: 2 };
const contentBounded: ColumnSize = { min: "content", max: 300 };

// @ts-expect-error -- `max` needs `min`; a `weight` beside it would be dropped
const cappedWeight: ColumnSize = { max: 300, weight: 1 };

// @ts-expect-error -- `max` needs `min`; alone it can collapse to 0
const ceilingOnly: ColumnSize = { max: 300 };

// @ts-expect-error -- an empty object says nothing; omit `size` instead
const empty: ColumnSize = {};

const display: JfColumnDef<Row> = { id: "actions", header: "", size: 84 };

const boundEnum: JfColumnDef<Row> = {
	accessorKey: "kind",
	header: "Kind",
	dataType: "enum",
	enumOptions: [
		{ value: "a", label: "A" },
		{ value: ["a", "b"], label: "A or B" },
	],
};

const derivedEnum: JfColumnDef<Row> = {
	id: "parity",
	header: "Parity",
	dataType: "enum",
	accessorFn: (row) => row.count % 2,
	enumOptions: [{ value: 0, label: "Even" }],
};

// @ts-expect-error -- "c" is not a value of `kind`
const badEnum: JfColumnDef<Row> = {
	accessorKey: "kind",
	header: "Kind",
	dataType: "enum",
	enumOptions: [{ value: "c", label: "C" }],
};

// @ts-expect-error -- an accessor column needs a `dataType`
const untyped: JfColumnDef<Row> = { accessorKey: "name", header: "Name" };

const minSize: JfColumnDef<Row> = {
	accessorKey: "name",
	header: "Name",
	dataType: "string",
	// @ts-expect-error -- a bound is part of `size` now
	minSize: 40,
};

const nested: JfColumnDef<Row> = {
	id: "group",
	header: "Group",
	// @ts-expect-error -- nested header columns are not supported
	columns: [],
};

void pixels;
void content;
void weight;
void floor;
void floorAndWeight;
void bounded;
void contentFloor;
void contentBounded;
void cappedWeight;
void ceilingOnly;
void empty;
void display;
void boundEnum;
void derivedEnum;
void badEnum;
void untyped;
void minSize;
void nested;
