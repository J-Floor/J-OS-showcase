import type {
	AccessorColumnDef,
	DisplayColumnDef,
} from "@tanstack/solid-table";

/**
 * How wide a column is.
 *
 * A bare number is a pixel width. `"content"` is exactly as wide as the
 * column's widest cell, header included. The object form combines a floor, a
 * ceiling and a share of the leftover width: `{ min: 200 }` never drops below
 * 200px and takes an equal share of what is left; `{ min: "content" }` never
 * drops below its widest cell. `weight` defaults to 1.
 *
 * Omitted, a column is `{ min: "content" }`. A bare `{ weight }` compiles to
 * `minmax(0, Nfr)` and may shrink below its content.
 *
 * `max` requires `min`: a capped track compiles to `minmax(min, max)`, which
 * has no `fr` component, so a `weight` beside a `max` is ignored. Requiring
 * the floor keeps it written down instead of an unstated 0.
 *
 * Ported from EmboUI's `columnTracks.ts` (#414), plus the `"content"` floor.
 */
export type ColumnSize =
	| number
	| "content"
	| { min: number | "content"; max?: number; weight?: number }
	| { min?: undefined; max?: undefined; weight: number };

/** The primitive values an enum filter can compare. */
export type EnumValue = string | number | boolean;

/**
 * One entry in a column's `enumOptions`: a label and the stored value(s) it
 * stands for. `value` takes an array when several raw values render as the
 * same label and should therefore be one filter entry.
 */
export type EnumOption<Value = string> = {
	readonly label: string;
	readonly value: Value | readonly Value[];
};

/**
 * The values a filter can actually compare. Anything else (an object field,
 * or a row type too loose to resolve) falls back to `string`.
 */
type EnumValueFor<Value> = [Extract<NonNullable<Value>, EnumValue>] extends [
	never,
]
	? string
	: Extract<NonNullable<Value>, EnumValue>;

/**
 * The enum arm for an `accessorKey` column, distributed over the row's keys,
 * so an option's `value` is bound to the field the column reads.
 *
 * Shallow keys (`keyof Data`), not EmboUI's `DeepKeys`: `DeepKeys` over the
 * Convex `people` document is a union TypeScript refuses to represent
 * (TS2590), and no J floor column reads a dotted path.
 */
type EnumByAccessorKey<Data> = {
	[Key in keyof Data & string]: {
		readonly dataType: "enum";
		readonly accessorKey: Key;
		readonly enumOptions: readonly EnumOption<EnumValueFor<Data[Key]>>[];
	};
}[keyof Data & string];

/** The enum arm for an `accessorFn` column: nothing to bind the options to. */
type EnumByAccessorFn = {
	readonly dataType: "enum";
	readonly accessorKey?: never;
	readonly enumOptions: readonly EnumOption<EnumValue>[];
};

type NonEnumDataType = {
	readonly dataType: "string" | "number" | "boolean" | "date" | "time";
	readonly enumOptions?: never;
};

type DataTypeFor<Data> =
	| NonEnumDataType
	| EnumByAccessorKey<Data>
	| EnumByAccessorFn;

/**
 * The row-agnostic `dataType` surface: what a processed column carries in its
 * `meta` at runtime. Drives the filter predicate and the filter popover body.
 */
export type DataType =
	| NonEnumDataType
	| {
			readonly dataType: "enum";
			readonly enumOptions: readonly EnumOption<EnumValue>[];
	  };

/**
 * `Omit` that distributes over a union. TanStack's `AccessorColumnDef` is
 * `AccessorKeyColumnDef | AccessorFnColumnDef`; the built-in `Omit` keeps only
 * the keys common to both and drops `accessorKey` and `accessorFn`.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
	? Omit<T, K>
	: never;

/** TanStack's numeric sizing. `size` is replaced by {@link ColumnSize}; a
 *  bound is part of the size (`{ min: 250 }`), so `minSize`/`maxSize` go. */
type TanStackSizingKeys = "size" | "minSize" | "maxSize";

/** Fields the J floor adds to every column kind. */
type ColumnExtras<Data> = {
	/**
	 * When true, clicking cells in this column will not trigger onRowClick.
	 * Useful for columns with interactive elements (buttons, inputs, etc.).
	 */
	disableRowClick?: boolean;
	/** How wide the column is. Omitted means `{ min: "content" }`. */
	size?: ColumnSize;
	/**
	 * The text the cell shows for a row, for sizing a content column. `false`
	 * measures the header only: for free text that wraps or a widget.
	 * Omitted, an enum column measures its option labels and any other column
	 * its value when that is a string or a number.
	 *
	 * Must be a pure function of the row: a row is measured again only when
	 * its data changes, so text that also depends on the clock (a relative
	 * "in 3 days") goes stale. Set `measureVolatile` for that.
	 */
	measureText?: ((row: Data) => string) | false;
	/**
	 * The column's text depends on more than the row (the current time), so
	 * every row is measured again on every measuring pass, that is on every
	 * data push, not on a timer. Widths still only grow.
	 */
	measureVolatile?: true;
	/** Nested header columns are not supported. */
	columns?: never;
};

/** A display column may omit `dataType`. */
type NoDataType = {
	readonly dataType?: undefined;
	readonly enumOptions?: never;
};

/** Keeps accessor columns strict: one that forgot its `dataType` cannot fall
 *  through to the display arm. */
type NoAccessor = {
	accessorKey?: never;
	accessorFn?: never;
};

/**
 * A TanStack column definition with the J floor's additions.
 *
 * - Accessor columns (`accessorKey`/`accessorFn`) require `dataType`, and an
 *   `enum` additionally requires `enumOptions` bound to the accessed field.
 * - Display columns (`{ id, header, cell }`) may omit `dataType`.
 *
 * Ported from EmboUI's `CustomColumnDef` (`@tanstack/react-table` →
 * `@tanstack/solid-table`), without group columns.
 */
export type JfColumnDef<
	Data extends Record<string, unknown>,
	Value = unknown,
> =
	| (DistributiveOmit<AccessorColumnDef<Data, Value>, TanStackSizingKeys> &
			DataTypeFor<Data> &
			ColumnExtras<Data>)
	| (DistributiveOmit<DisplayColumnDef<Data, Value>, TanStackSizingKeys> &
			(DataType | NoDataType) &
			NoAccessor &
			ColumnExtras<Data>);
