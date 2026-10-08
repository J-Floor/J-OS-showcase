import type { Row as TanRow } from "@tanstack/solid-table";

import {
	cellMeasureText,
	createBodyNeeds,
	createCachedMeasurer,
	createTextMeasurer,
	measureHeaderNeeds,
	sameFont,
	sameNeeds,
	setTableTextMeasurer,
	type MeasuredColumn,
} from "./columnWidths.ts";
import type { JfColumnDef } from "./types.ts";

type Item = {
	name: string;
	count: number;
	tags: string[];
	state: string;
	at: number;
	note?: string;
};

/** A row stub: the width logic only reads `original` and `getValue`. */
let nextRowId = 0;

function rowOf(item: Item, id = String(nextRowId++)): TanRow<Item> {
	return {
		id,
		original: item,
		getValue: (id: string) => {
			if (id === "label") return `${item.name}!`;
			return item[id as keyof Item];
		},
	} as unknown as TanRow<Item>;
}

function column(def: JfColumnDef<Item>): MeasuredColumn<Item> {
	return { id: def.id ?? (def as { accessorKey: string }).accessorKey, def };
}

const byKey = column({
	accessorKey: "name",
	header: "Name",
	dataType: "string",
});
const byNumber = column({
	accessorKey: "count",
	header: "Count",
	dataType: "number",
});
const byFn = column({
	id: "label",
	header: "Label",
	dataType: "string",
	accessorFn: (r) => `${r.name}!`,
});
const byArray = column({
	accessorKey: "tags",
	header: "Tags",
	dataType: "string",
});
const formatted = column({
	accessorKey: "at",
	header: "At",
	dataType: "date",
	measureText: (r) => `day ${String(r.at)}`,
});
const optedOut = column({
	id: "free",
	accessorKey: "name",
	header: "Free",
	dataType: "string",
	measureText: false,
});
const display = column({ id: "actions", header: "" });
const states = column({
	accessorKey: "state",
	header: "State",
	dataType: "enum",
	enumOptions: [
		{ value: "ok", label: "Fine" },
		{ value: ["dry-run", "busy"], label: "Skipped" },
	],
});
const tagged = column({
	accessorKey: "tags",
	header: "Tags",
	dataType: "enum",
	enumOptions: [
		{ value: "x", label: "Ex" },
		{ value: "y", label: "Why" },
	],
});
const optional = column({
	accessorKey: "note",
	header: "Note",
	dataType: "string",
});

const ada = rowOf({
	name: "Ada",
	count: 7,
	tags: ["x", "y"],
	state: "busy",
	at: 3,
});

test("measureText wins, and false skips the body", () => {
	expect(cellMeasureText(formatted, ada)).toBe("day 3");
	expect(cellMeasureText(optedOut, ada)).toBeUndefined();
});

test("an enum shows its option label, joined for an array value", () => {
	expect(cellMeasureText(states, ada)).toBe("Skipped");
	expect(cellMeasureText(tagged, ada)).toBe("Ex, Why");
	expect(
		cellMeasureText(
			states,
			rowOf({ name: "B", count: 0, tags: [], state: "new", at: 0 })
		)
	).toBe("new");
});

test("a string or number value is its own text", () => {
	expect(cellMeasureText(byKey, ada)).toBe("Ada");
	expect(cellMeasureText(byNumber, ada)).toBe("7");
	expect(cellMeasureText(byFn, ada)).toBe("Ada!");
});

test("a value with no text measures as empty", () => {
	expect(cellMeasureText(byArray, ada)).toBe("");
	expect(cellMeasureText(display, ada)).toBe("");
	expect(cellMeasureText(optional, ada)).toBe("");
});

test("the cached measurer measures each distinct string once", () => {
	const measure = vi.fn((text: string) => text.length * 10);
	const cached = createCachedMeasurer(measure);
	expect(cached("ab")).toBe(20);
	expect(cached("ab")).toBe(20);
	expect(cached("abc")).toBe(30);
	expect(measure).toHaveBeenCalledTimes(2);
});

/** Body needs measured from scratch, as a fresh table's first pass does. */
function freshBodyNeeds(
	columns: readonly MeasuredColumn<Item>[],
	rows: readonly TanRow<Item>[],
	measure: (text: string) => number,
	paddingInline: number
): Readonly<Record<string, number>> {
	return createBodyNeeds<Item>()(columns, rows, measure, paddingInline, "");
}

test("a fresh createBodyNeeds is the widest cell over every row plus padding and slack", () => {
	const rows = [
		ada,
		rowOf({
			name: "Grace Hopper",
			count: 1234,
			tags: [],
			state: "ok",
			at: 10,
		}),
	];
	const needs = freshBodyNeeds(
		[byKey, byNumber, formatted, optedOut, display, states],
		rows,
		(text) => text.length * 10,
		16
	);
	// "Grace Hopper" 120 + 16 + 1, "1234" 40 + 16 + 1, "day 10" 60 + 16 + 1,
	// "Skipped" 70 + 16 + 1. The opted-out column and the text-less actions
	// column get no entry.
	expect(needs).toEqual({ name: 137, count: 57, at: 77, state: 87 });
});

test("measureHeaderNeeds adds label, gap, buttons, padding and slack", () => {
	const thead = document.createElement("thead");
	thead.innerHTML = `
		<tr>
			<th data-column-id="name" style="padding: 0 8px"><span data-header-cell style="column-gap: 8px"><span data-header-label>Name</span><span data-header-actions></span></span></th>
			<th data-column-id="actions"><span data-header-cell><span data-header-label></span><span data-header-actions></span></span></th>
		</tr>`;
	document.body.append(thead);
	const label = thead.querySelector<HTMLElement>(
		'[data-column-id="name"] [data-header-label]'
	);
	const actions = thead.querySelector<HTMLElement>(
		'[data-column-id="name"] [data-header-actions]'
	);
	if (!label || !actions) throw new Error("fixture");
	Object.defineProperty(label, "scrollWidth", { value: 40 });
	actions.getBoundingClientRect = () => ({ width: 30 }) as DOMRect;
	// Label 40 + gap 8 + buttons 30 + padding 16 + slack 1. The empty
	// actions header is skipped.
	expect(measureHeaderNeeds(thead)).toEqual({ name: 95 });
	thead.remove();
});

test("sameNeeds compares column by column", () => {
	expect(sameNeeds({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
	expect(sameNeeds({ a: 1 }, { a: 2 })).toBe(false);
	expect(sameNeeds({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	expect(sameNeeds({ a: 1 }, { b: 1 })).toBe(false);
});

test("sameFont compares font and letter spacing", () => {
	const font = { font: "normal 400 16px Inter", letterSpacing: "normal" };
	expect(sameFont(font, { ...font })).toBe(true);
	expect(sameFont(font, { ...font, letterSpacing: "1px" })).toBe(false);
	expect(sameFont(undefined, undefined)).toBe(true);
	expect(sameFont(font, undefined)).toBe(false);
});

const FONT = { font: "normal 400 16px Inter", letterSpacing: "normal" };

test("with no canvas there is no measurer, and the table sizes from headers", () => {
	expect(createTextMeasurer(FONT)).toBeUndefined();
});

test("an injected measurer is used, cached, and reset back to the canvas", () => {
	const measure = vi.fn((text: string) => text.length * 10);
	setTableTextMeasurer(() => measure);
	const measurer = createTextMeasurer(FONT);
	expect(measurer?.("abc")).toBe(30);
	expect(measurer?.("abc")).toBe(30);
	expect(measure).toHaveBeenCalledTimes(1);
	setTableTextMeasurer(() => undefined);
	expect(createTextMeasurer(FONT)).toBeUndefined();
	setTableTextMeasurer(undefined);
	expect(createTextMeasurer(FONT)).toBeUndefined();
});

test("a fresh createBodyNeeds takes the widest of many rows, wherever it sits", () => {
	const rows = ["Al", "Bartholomew", "Cy", "Dee"].map((name) =>
		rowOf({ name, count: 0, tags: [], state: "ok", at: 0 })
	);
	expect(
		freshBodyNeeds([byKey], rows, (text) => text.length * 10, 0)
	).toEqual({
		name: 111,
	});
});

test("a fresh createBodyNeeds leaves out a column every row leaves empty", () => {
	const rows = [1, 2, 3].map((count) =>
		rowOf({ name: "x", count, tags: [], state: "ok", at: 0 })
	);
	expect(
		freshBodyNeeds([optional, byArray], rows, (text) => text.length * 10, 8)
	).toEqual({});
});

test("createBodyNeeds re-measures a row only when its id is new or its fields changed", () => {
	const measure = vi.fn((text: string) => text.length * 10);
	const fold = createBodyNeeds<Item>();
	function item(name: string): Item {
		return { name, count: 0, tags: [], state: "ok", at: 0 };
	}
	const first = [rowOf(item("Ada"), "a"), rowOf(item("Grace Hopper"), "b")];
	expect(fold([byKey], first, measure, 0, "k")).toEqual({ name: 121 });
	measure.mockClear();
	const copies = first.map((row) => rowOf({ ...row.original }, row.id));
	expect(fold([byKey], copies, measure, 0, "k")).toEqual({ name: 121 });
	expect(measure).not.toHaveBeenCalled();
	// "b" leaves: its width stays. "a" changes: only it is measured again.
	const changed = [rowOf(item("Ada L"), "a")];
	expect(fold([byKey], changed, measure, 0, "k")).toEqual({ name: 121 });
	expect(measure.mock.calls).toEqual([["Ada L"]]);
	// A new columns key starts over, exactly.
	expect(fold([byKey], changed, measure, 0, "k2")).toEqual({ name: 51 });
});

test("createBodyNeeds treats a fresh array with the same items as unchanged", () => {
	const measure = vi.fn((text: string) => text.length * 10);
	const fold = createBodyNeeds<Item>();
	const item: Item = {
		name: "Ada",
		count: 0,
		tags: ["x"],
		state: "ok",
		at: 0,
	};
	fold([byKey], [rowOf(item, "a")], measure, 0, "k");
	measure.mockClear();
	fold([byKey], [rowOf({ ...item, tags: ["x"] }, "a")], measure, 0, "k");
	expect(measure).not.toHaveBeenCalled();
	fold([byKey], [rowOf({ ...item, tags: ["y"] }, "a")], measure, 0, "k");
	expect(measure).toHaveBeenCalledTimes(1);
});
