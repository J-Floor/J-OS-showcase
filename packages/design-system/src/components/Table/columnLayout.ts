import type { Table as TanTable } from "@tanstack/solid-table";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
	type Setter,
} from "solid-js";

import { afterPaint } from "../../utils/afterPaint.ts";

import {
	SELECT_COLUMN_ID,
	resolveTrackLayout,
	usesContent,
	type TrackLayout,
} from "./columnTracks.ts";
import {
	createBodyNeeds,
	createTextMeasurer,
	horizontalPadding,
	measureHeaderNeeds,
	readTextFont,
	sameFont,
	sameNeeds,
	type ColumnNeeds,
	type MeasuredColumn,
	type TextFont,
	type TextMeasurer,
} from "./columnWidths.ts";
import {
	BODY_TEXT_CELL_SELECTOR,
	COLUMN_ID_ATTR,
	HEADER_COLUMN_SELECTOR,
} from "./domContract.ts";
import { columnDefinitionMeta, columnMeta } from "./hooks.ts";
import type { JfColumnDefinition } from "./types.ts";

/** Text whose width any change of face changes. */
const FONT_PROBE =
	"The quick brown fox jumps over the lazy dog 0 1 2 3 4 5 6 7 8 9";

/**
 * How many content columns get an animated width property. Must match
 * `$animated-columns` in Table.module.scss, which registers them: a column
 * past it writes its width into the track list and changes instantly.
 */
export const ANIMATED_COLUMNS = 32;

/** The registered `<length>` property holding the content width of the
 *  visible column at `index`. */
function columnWidthProperty(index: number): string {
	return `--jf-col-${String(index)}`;
}

/**
 * The track list, its floor, and the width properties its content tracks
 * read (`var(--jf-col-<i>)`). A data change moves only the properties, which
 * the table transitions, so every row reads one interpolated value per frame.
 */
export type ColumnLayout = TrackLayout & {
	widths: Readonly<Record<string, string>>;
};

function sameLayout(left: ColumnLayout, right: ColumnLayout): boolean {
	const names = Object.keys(left.widths);
	return (
		left.tracks === right.tracks &&
		left.floor === right.floor &&
		names.length === Object.keys(right.widths).length &&
		names.every((name) => left.widths[name] === right.widths[name])
	);
}

/**
 * The font body text renders in: read from a body text cell, or, while the
 * body has none (no rows yet), from a probe cell put in the body for the
 * read and taken out again.
 */
function bodyFont(table: HTMLTableElement): TextFont | undefined {
	const cell = table.querySelector<HTMLElement>(BODY_TEXT_CELL_SELECTOR);
	if (cell) return readTextFont(cell);
	const tbody = table.querySelector("tbody");
	if (!tbody) return undefined;
	const probe = document.createElement("td");
	tbody.append(probe);
	const font = readTextFont(probe);
	probe.remove();
	return font;
}

/**
 * The body font and the canvas measurer built from it. A web font that
 * changes the face the body resolves to swaps the cached measurer for a fresh
 * one (`fontsLoaded`).
 */
function createFontMeasurement(measureDom: () => void): {
	setFont: Setter<TextFont | undefined>;
	measurer: () => TextMeasurer | undefined;
	fontsLoaded: () => void;
} {
	const [font, setFont] = createSignal<TextFont | undefined>(undefined, {
		equals: sameFont,
	});
	// Bumped when a web font that changes what the canvas measures finishes
	// loading: the font string does not change, so the cached measurer must
	// be swapped for `fontLoadMeasurer`.
	const [fontEpoch, setFontEpoch] = createSignal(0);
	let fontLoadMeasurer: TextMeasurer | undefined;

	const measurer = createMemo(() => {
		fontEpoch();
		const current = font();
		const next =
			fontLoadMeasurer ??
			(current === undefined ? undefined : createTextMeasurer(current));
		fontLoadMeasurer = undefined;
		// Cached now, so a later font load compares against this font's
		// width rather than the loaded one's.
		next?.(FONT_PROBE);
		return next;
	});

	/** A font load changes widths only when it changes the face the body
	 *  font resolves to: another face loading (an icon font, a heading
	 *  weight) keeps every width. */
	function fontsLoaded(): void {
		measureDom();
		const current = font();
		const previous = measurer();
		if (current === undefined || previous === undefined) return;
		const fresh = createTextMeasurer(current);
		if (fresh === undefined || fresh(FONT_PROBE) === previous(FONT_PROBE))
			return;
		fontLoadMeasurer = fresh;
		setFontEpoch((count) => count + 1);
	}

	return { setFont, measurer, fontsLoaded };
}

/** The track list for the visible columns, plus the width property each
 *  animated content track reads. */
function buildLayout<Data extends Record<string, unknown>>(
	table: TanTable<Data>,
	header: ColumnNeeds,
	body: ColumnNeeds
): ColumnLayout {
	const widths: Record<string, string> = {};
	const resolved = resolveTrackLayout(
		table.getVisibleLeafColumns().map((column, index) => {
			const size = columnMeta(column).size;
			const content = Math.ceil(
				Math.max(header[column.id] ?? 0, body[column.id] ?? 0)
			);
			if (!usesContent(size) || index >= ANIMATED_COLUMNS)
				return { id: column.id, size, content };
			const name = columnWidthProperty(index);
			widths[name] = `${String(content)}px`;
			return {
				id: column.id,
				size,
				content,
				contentCss: `var(${name})`,
			};
		})
	);
	return { ...resolved, widths };
}

/** Warns once per column that is sized to its content but gave the measurer
 *  no text. */
function warnMissingMeasureText<Data extends Record<string, unknown>>(
	columns: readonly MeasuredColumn<Data>[],
	needs: ColumnNeeds,
	warned: Set<string>
): void {
	for (const { id, def } of columns) {
		if (
			warned.has(id) ||
			id in needs ||
			def.measureText === false ||
			columnDefinitionMeta(def).customCell !== true
		)
			continue;
		warned.add(id);
		// eslint-disable-next-line no-console -- a warning for the developer, not the user
		console.warn(
			`Table: column "${id}" is sized to its content, but no row gives it text to measure. Give it a measureText.`
		);
	}
}

/** The visible columns that are sized to their content. */
function contentColumns<Data extends Record<string, unknown>>(
	table: TanTable<Data>
): MeasuredColumn<Data>[] {
	return table
		.getVisibleLeafColumns()
		.filter((column) => usesContent(columnMeta(column).size))
		.map((column) => ({
			id: column.id,
			def: column.columnDef as JfColumnDefinition<Data>,
		}));
}

/** The visible columns and their sizes: when these change, the body is
 *  measured afresh. */
function columnsKey<Data extends Record<string, unknown>>(
	table: TanTable<Data>
): string {
	return JSON.stringify(
		table
			.getVisibleLeafColumns()
			.map((column) => [column.id, columnMeta(column).size])
	);
}

/** Calls `onLoad` when a web font finishes loading, until cleanup. */
function listenForFontLoads(onLoad: () => void): void {
	if (!("fonts" in document)) return;
	// `loadingdone` alone, not `fonts.ready` too: a font that loads after
	// mount fires it, and one loaded before mount is already measured.
	const fonts = document.fonts;
	fonts.addEventListener("loadingdone", onLoad);
	onCleanup(() => {
		fonts.removeEventListener("loadingdone", onLoad);
	});
}

/** What the body measurement runs with, and when it starts over. */
function bodySettings<Data extends Record<string, unknown>>(
	table: TanTable<Data>,
	measure: TextMeasurer,
	paddingInline: number
): { measure: TextMeasurer; paddingInline: number; columnsKey: string } {
	return { measure, paddingInline, columnsKey: columnsKey(table) };
}

/**
 * The table's column tracks, kept in step with what the columns hold.
 *
 * Every track that is not content-sized is deterministic, so grid resolves it
 * the same way in every row with no JS. Only `"content"` needs a number: the
 * column's header (read from the DOM, which always renders it) and its widest
 * body cell over EVERY row of the unfiltered core model (measured from the
 * data with a canvas, because a virtualised table renders a window of rows
 * and a collapsed group renders none). Filtering never shifts a width.
 *
 * Measures once in `onMount`, before the first paint; again when the columns
 * or the core rows change, when a web font finishes loading (a canvas
 * measures with the fallback font until then), and when a scroll parent that
 * was 0 high gets a height (a table mounted in a hidden tab). Never on scroll.
 * Unchanged results are not written, so a resize observer reacting to a
 * write cannot loop.
 */
export function createColumnLayout<
	Data extends Record<string, unknown>,
>(options: {
	table: TanTable<Data>;
	tableEl: () => HTMLTableElement | undefined;
	/** A focusable table's ringed row renders bold, so it measures bold. */
	focusableRows: () => boolean;
	scrollParentHeight: () => number;
}): () => ColumnLayout {
	const [headerNeeds, setHeaderNeeds] = createSignal<ColumnNeeds>(
		{},
		{ equals: sameNeeds }
	);
	const [padding, setPadding] = createSignal(0);
	const { setFont, measurer, fontsLoaded } =
		createFontMeasurement(measureDom);

	const growBodyNeeds = createBodyNeeds<Data>();
	const cellNeeds = createMemo<ColumnNeeds>(
		() => {
			const measure = measurer();
			return measure === undefined
				? {}
				: growBodyNeeds(
						contentColumns(options.table),
						options.table.getCoreRowModel().rows,
						bodySettings(options.table, measure, padding())
					);
		},
		{},
		{ equals: sameNeeds }
	);

	function measureDom(): void {
		const element = options.tableEl();
		const thead = element?.querySelector("thead");
		if (!element?.isConnected || !thead) return;
		// Merged, not replaced: a header that measures 0 (hidden) keeps its
		// last good width instead of collapsing the column.
		const measured = measureHeaderNeeds(thead);
		setHeaderNeeds((prev) => ({ ...prev, ...measured }));
		// Header and body cells share their padding (`.table th, .table td`).
		const headerCell = thead.querySelector<HTMLElement>(
			`${HEADER_COLUMN_SELECTOR}:not([${COLUMN_ID_ATTR}="${SELECT_COLUMN_ID}"])`
		);
		if (headerCell) setPadding(horizontalPadding(headerCell));
		if (options.focusableRows()) {
			if (headerCell) setFont(readTextFont(headerCell));
		} else {
			setFont(bodyFont(element));
		}
	}

	onMount(() => {
		measureDom();
		listenForFontLoads(fontsLoaded);
	});

	createEffect(
		on(
			() => [
				options.table.getVisibleLeafColumns(),
				options.table.getCoreRowModel().rows.length,
				options.scrollParentHeight(),
			],
			measureDom,
			{ defer: true }
		)
	);

	// A content column whose rows all measure empty has a custom cell the
	// default text cannot see into. Its width falls back to the header alone.
	const warned = new Set<string>();
	createEffect(() => {
		if (
			!import.meta.env.DEV ||
			measurer() === undefined ||
			options.table.getCoreRowModel().rows.length === 0
		)
			return;
		const needs = cellNeeds();
		warnMissingMeasureText(contentColumns(options.table), needs, warned);
	});

	const layout = createMemo<ColumnLayout>(
		() => buildLayout(options.table, headerNeeds(), cellNeeds()),
		{ ...resolveTrackLayout([]), widths: {} },
		{ equals: sameLayout }
	);

	return layout;
}

/**
 * Track changes animate (`[data-animate-tracks]` in the stylesheet) only
 * once the first layout with data has painted, so a table never animates
 * in, not even one mounted in a hidden tab and shown later.
 */
export function createTracksSettled(options: {
	loading: () => boolean;
	hidden: () => boolean;
}): Accessor<boolean> {
	const [tracksSettled, setTracksSettled] = createSignal(false);
	createEffect(() => {
		if (tracksSettled() || options.loading() || options.hidden()) return;
		onCleanup(afterPaint(() => setTracksSettled(true)));
	});
	return tracksSettled;
}
