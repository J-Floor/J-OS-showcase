import type { Row as TanRow } from "@tanstack/solid-table";

import {
	COLUMN_ID_ATTR,
	HEADER_ACTIONS_ATTR,
	HEADER_CELL_ATTR,
	HEADER_COLUMN_SELECTOR,
	HEADER_LABEL_ATTR,
} from "./domContract.ts";
import { enumCellText } from "./filter.ts";
import type { JfColumnDefinition } from "./types.ts";

/** Width in px a string takes in the body font. */
export type TextMeasurer = (text: string) => number;

/** The font a measurer measures in, as the browser computed it. */
export type TextFont = { font: string; letterSpacing: string };

/** Builds a measurer for a font, or `undefined` where nothing can measure. */
type TextMeasurerFactory = (font: TextFont) => TextMeasurer | undefined;

/** px per column id. */
export type ColumnNeeds = Readonly<Record<string, number>>;

/** A visible leaf column as the width logic sees it. */
export type MeasuredColumn<Data extends Record<string, unknown>> = {
	id: string;
	def: JfColumnDefinition<Data>;
};

/** Canvas text metrics and laid-out text can differ by a fraction of a pixel;
 *  this much extra keeps a measured cell from wrapping or ellipsing. */
const SUBPIXEL_SLACK = 1;

function plainText(value: unknown): string {
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: "";
}

/**
 * The text a column's cell shows for one row: the column's `measureText`
 * when it has one; for an enum, the matching option labels (joined with ", "
 * for an array value); else the value when it is a string or a number; else
 * `""`. `undefined` when the column opts out with `measureText: false`.
 */
export function cellMeasureText<Data extends Record<string, unknown>>(
	column: MeasuredColumn<Data>,
	row: TanRow<Data>
): string | undefined {
	const { def, id } = column;
	if (def.measureText === false) return undefined;
	if (def.measureText) return def.measureText(row.original);
	const value = row.getValue(id);
	return def.dataType === "enum"
		? enumCellText(def.enumOptions, value)
		: plainText(value);
}

/** Wraps a measurer so each distinct string is measured once. */
export function createCachedMeasurer(measure: TextMeasurer): TextMeasurer {
	const cache = new Map<string, number>();
	return (text) => {
		const hit = cache.get(text);
		if (hit !== undefined) return hit;
		const width = measure(text);
		cache.set(text, width);
		return width;
	};
}

type TextContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** One context for every table, made on first use: `null` once known to be
 *  unavailable (jsdom has no canvas). */
let sharedContext: TextContext | null | undefined;

function textContext(): TextContext | null {
	if (sharedContext !== undefined) return sharedContext;
	sharedContext =
		typeof OffscreenCanvas === "undefined"
			? document.createElement("canvas").getContext("2d")
			: new OffscreenCanvas(1, 1).getContext("2d");
	return sharedContext;
}

/**
 * Measures text with a canvas: an `OffscreenCanvas`, else a detached
 * `<canvas>`. `undefined` with neither, and the table then sizes content
 * columns from their headers alone.
 */
export function canvasTextMeasurer(font: TextFont): TextMeasurer | undefined {
	const context = textContext();
	if (!context) return undefined;
	return (text) => {
		context.font = font.font;
		context.letterSpacing = font.letterSpacing;
		return context.measureText(text).width;
	};
}

let measurerFactory: TextMeasurerFactory = canvasTextMeasurer;

/**
 * Test hook: every table measures body text with `factory` from now on, or
 * with the canvas again when passed `undefined`. jsdom has no canvas, so a
 * test that checks content widths injects a deterministic measurer (say
 * `text.length * 10`). App code never calls this.
 */
export function setTableTextMeasurer(
	factory: TextMeasurerFactory | undefined
): void {
	measurerFactory = factory ?? canvasTextMeasurer;
}

/** A cached measurer for `font` from the current factory. */
export function createTextMeasurer(font: TextFont): TextMeasurer | undefined {
	const measure = measurerFactory(font);
	return measure === undefined ? undefined : createCachedMeasurer(measure);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
}

/**
 * Structural equality for plain JSON-like values, as a pushed document is:
 * arrays item by item, plain objects key by key, recursively, and every
 * other value (string, number, bigint, `ArrayBuffer`, ...) by `Object.is`.
 * A push re-parses every nested object and array fresh.
 */
export function sameStructure(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left)) {
		return (
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((item, index) => sameStructure(item, right[index]))
		);
	}
	if (!isPlainObject(left) || !isPlainObject(right)) return false;
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every(
			(key) =>
				Object.hasOwn(right, key) &&
				sameStructure(left[key], right[key])
		)
	);
}

/**
 * Body needs that only grow: each column's widest cell over every row seen
 * since the last reset, padding and slack included. Rows are tracked by
 * `row.id`. A data push measures only rows with a new id or whose original
 * is not {@link sameStructure} equal to the one last measured under that id:
 * a live data push hands back fresh objects for every row, most with the same
 * fields. A `measureVolatile` column is measured in every row on every pass.
 * Keyed by `getRowId`, a row inserted above the others shifts nothing. A row
 * that leaves keeps the width it gave. From the data, not the DOM: a
 * virtualised table renders only a window of its rows, and a collapsed group
 * renders none. A column that opts out, or shows no text in any row, gets no
 * entry.
 *
 * Starts over, measuring every row exactly, when `measure` or `columnsKey`
 * changes: a new font measures every string differently, and a column that
 * comes back may show something else.
 */
export function createBodyNeeds<Data extends Record<string, unknown>>(): (
	columns: readonly MeasuredColumn<Data>[],
	rows: readonly TanRow<Data>[],
	settings: BodyNeedsSettings
) => ColumnNeeds {
	let measured = new Map<string, Data>();
	let widest: Record<string, number> = {};
	let basis: { measure: TextMeasurer; columnsKey: string } | undefined;
	return (columns, rows, settings) => {
		const { measure, paddingInline, columnsKey } = settings;
		if (basis?.measure !== measure || basis.columnsKey !== columnsKey) {
			measured = new Map();
			widest = {};
			basis = { measure, columnsKey };
		}
		const current = new Map<string, Data>();
		for (const row of rows) {
			current.set(row.id, row.original);
			const previous = measured.get(row.id);
			const isUnchanged =
				previous !== undefined && sameStructure(previous, row.original);
			for (const column of columns) {
				if (isUnchanged && column.def.measureVolatile !== true)
					continue;
				widenColumn(widest, column, row, measure);
			}
		}
		measured = current;
		return paddedNeeds(widest, columns, paddingInline);
	};
}

/** What `createBodyNeeds` measures with, and when it starts over: a new
 *  `measure` or `columnsKey` discards everything measured so far. */
type BodyNeedsSettings = {
	measure: TextMeasurer;
	paddingInline: number;
	columnsKey: string;
};

/** Grows `widest` for a column to the width of this row's cell text. */
function widenColumn<Data extends Record<string, unknown>>(
	widest: Record<string, number>,
	column: MeasuredColumn<Data>,
	row: TanRow<Data>,
	measure: TextMeasurer
): void {
	const text = cellMeasureText(column, row);
	if (text)
		widest[column.id] = Math.max(widest[column.id] ?? 0, measure(text));
}

/** The widest widths with padding and slack added; a column with none gets no
 *  entry. */
function paddedNeeds<Data extends Record<string, unknown>>(
	widest: Readonly<Record<string, number>>,
	columns: readonly MeasuredColumn<Data>[],
	paddingInline: number
): ColumnNeeds {
	const needs: Record<string, number> = {};
	for (const { id } of columns) {
		const width = widest[id] ?? 0;
		if (width > 0) needs[id] = width + paddingInline + SUBPIXEL_SLACK;
	}
	return needs;
}

function px(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** An element's computed left plus right padding. */
export function horizontalPadding(element: Element): number {
	const style = getComputedStyle(element);
	return px(style.paddingLeft) + px(style.paddingRight);
}

/**
 * What each header needs to show its whole label, the gap and its sort and
 * filter buttons on one line, padding and slack included, keyed by column
 * id.
 *
 * Reads the label's `scrollWidth`, which is its full text width even while
 * the ellipsis shows: the label never grows past its text (`flex: 0 1
 * auto`), so a wide column does not report its own width back. A label that
 * measures 0 is skipped: nothing is laid out (a hidden tab panel, jsdom), or
 * the header is empty (the actions column).
 */
export function measureHeaderNeeds(thead: HTMLElement): ColumnNeeds {
	const needs: Record<string, number> = {};
	const headerCells = Array.from(
		thead.querySelectorAll<HTMLElement>(HEADER_COLUMN_SELECTOR)
	);
	for (const th of headerCells) {
		const id = th.getAttribute(COLUMN_ID_ATTR);
		const cell = th.querySelector<HTMLElement>(`[${HEADER_CELL_ATTR}]`);
		const label = th.querySelector<HTMLElement>(`[${HEADER_LABEL_ATTR}]`);
		const actions = th.querySelector<HTMLElement>(
			`[${HEADER_ACTIONS_ATTR}]`
		);
		if (!id || !cell || !label || !actions) continue;
		const labelWidth = label.scrollWidth;
		if (labelWidth === 0) continue;
		needs[id] =
			labelWidth +
			px(getComputedStyle(cell).columnGap) +
			actions.getBoundingClientRect().width +
			horizontalPadding(th) +
			SUBPIXEL_SLACK;
	}
	return needs;
}

/** The font an element's text renders in. */
export function readTextFont(element: Element): TextFont {
	const style = getComputedStyle(element);
	return {
		font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
		letterSpacing: style.letterSpacing,
	};
}

export function sameNeeds(left: ColumnNeeds, right: ColumnNeeds): boolean {
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every((key) => left[key] === right[key])
	);
}

export function sameFont(
	left: TextFont | undefined,
	right: TextFont | undefined
): boolean {
	return (
		left?.font === right?.font &&
		left?.letterSpacing === right?.letterSpacing
	);
}
