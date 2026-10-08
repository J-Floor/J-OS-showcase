import type { Table as TanTable } from "@tanstack/solid-table";
import {
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";

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
import { columnDefMeta, columnMeta } from "./hooks.ts";
import type { JfColumnDef } from "./types.ts";

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

function sameLayout(a: ColumnLayout, b: ColumnLayout): boolean {
	const names = Object.keys(a.widths);
	return (
		a.tracks === b.tracks &&
		a.floor === b.floor &&
		names.length === Object.keys(b.widths).length &&
		names.every((name) => a.widths[name] === b.widths[name])
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
export function createColumnLayout<Data extends Record<string, unknown>>(opts: {
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
	const [font, setFont] = createSignal<TextFont | undefined>(undefined, {
		equals: sameFont,
	});
	const [padding, setPadding] = createSignal(0);
	// Bumped when a web font that changes what the canvas measures finishes
	// loading: the font string does not change, so the cached measurer must
	// be swapped for `fontLoadMeasurer`.
	const [fontEpoch, setFontEpoch] = createSignal(0);
	let fontLoadMeasurer: TextMeasurer | undefined;

	function contentColumns(): MeasuredColumn<Data>[] {
		return opts.table
			.getVisibleLeafColumns()
			.filter((column) => usesContent(columnMeta(column).size))
			.map((column) => ({
				id: column.id,
				def: column.columnDef as JfColumnDef<Data>,
			}));
	}

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
		setFontEpoch((n) => n + 1);
	}

	/** The visible columns and their sizes: when these change, the body is
	 *  measured afresh. */
	function columnsKey(): string {
		return JSON.stringify(
			opts.table
				.getVisibleLeafColumns()
				.map((column) => [column.id, columnMeta(column).size])
		);
	}

	const growBodyNeeds = createBodyNeeds<Data>();
	const cellNeeds = createMemo<ColumnNeeds>(
		() => {
			const measure = measurer();
			if (measure === undefined) return {};
			return growBodyNeeds(
				contentColumns(),
				opts.table.getCoreRowModel().rows,
				measure,
				padding(),
				columnsKey()
			);
		},
		{},
		{ equals: sameNeeds }
	);

	function measureDom(): void {
		const el = opts.tableEl();
		const thead = el?.querySelector("thead");
		if (!el?.isConnected || !thead) return;
		// Merged, not replaced: a header that measures 0 (hidden) keeps its
		// last good width instead of collapsing the column.
		const measured = measureHeaderNeeds(thead);
		setHeaderNeeds((prev) => ({ ...prev, ...measured }));
		// Header and body cells share their padding (`.table th, .table td`).
		const headerCell = thead.querySelector<HTMLElement>(
			`${HEADER_COLUMN_SELECTOR}:not([${COLUMN_ID_ATTR}="${SELECT_COLUMN_ID}"])`
		);
		if (headerCell) setPadding(horizontalPadding(headerCell));
		if (opts.focusableRows()) {
			if (headerCell) setFont(readTextFont(headerCell));
		} else {
			setFont(bodyFont(el));
		}
	}

	onMount(() => {
		measureDom();
		if (!("fonts" in document)) return;
		// `loadingdone` alone, not `fonts.ready` too: a font that loads after
		// mount fires it, and one loaded before mount is already measured.
		const fonts = document.fonts;
		fonts.addEventListener("loadingdone", fontsLoaded);
		onCleanup(() => {
			fonts.removeEventListener("loadingdone", fontsLoaded);
		});
	});

	createEffect(
		on(
			() => [
				opts.table.getVisibleLeafColumns(),
				opts.table.getCoreRowModel().rows.length,
				opts.scrollParentHeight(),
			],
			measureDom,
			{ defer: true }
		)
	);

	// A content column whose rows all measure empty has a custom cell the
	// default text cannot see into. Its width falls back to the header alone.
	const warned = new Set<string>();
	createEffect(() => {
		if (!import.meta.env.DEV || measurer() === undefined) return;
		if (opts.table.getCoreRowModel().rows.length === 0) return;
		const needs = cellNeeds();
		for (const { id, def } of contentColumns()) {
			if (
				warned.has(id) ||
				id in needs ||
				def.measureText === false ||
				columnDefMeta(def).customCell !== true
			)
				continue;
			warned.add(id);
			// eslint-disable-next-line no-console -- a warning for the developer, not the user
			console.warn(
				`Table: column "${id}" is sized to its content, but no row gives it text to measure. Give it a measureText.`
			);
		}
	});

	const layout = createMemo<ColumnLayout>(
		() => {
			const header = headerNeeds();
			const body = cellNeeds();
			const widths: Record<string, string> = {};
			const resolved = resolveTrackLayout(
				opts.table.getVisibleLeafColumns().map((column, index) => {
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
		},
		{ ...resolveTrackLayout([]), widths: {} },
		{ equals: sameLayout }
	);

	return layout;
}
