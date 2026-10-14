import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";

import styles from "./Chart.module.scss";
import {
	axisLabel,
	maxOf,
	niceScale,
	numberAt,
	stackRows,
	type ChartDatum,
	type ChartSeries,
} from "./scale.ts";

/**
 * Layout for `Chart`: the plot's size and coordinate system, and the bars and
 * marks laid out in it. Kept apart from the rendering so each file reads one
 * thing.
 */

/** Plot padding, in the SVG's own user units: room for the axis labels. */
const PAD = { top: 8, right: 8, bottom: 22, left: 34 };
/**
 * Width and height assumed before the first measurement, and whenever measuring
 * is impossible — which is every test, because jsdom performs no layout and has
 * no `ResizeObserver` at all. Drawing at an assumed size beats drawing nothing:
 * the SVG re-lays-out the moment a real size arrives, and in jsdom the marks
 * exist to be asserted on.
 */
const ASSUMED = { width: 640, height: 180 };
/** Share of a category band given to bars; the rest is the gap that lets the
 *  eye separate one category from the next. */
const BAR_BAND_SHARE = 0.7;

const POLARITY_CLASSES = {
	positive: styles.seriesPositive,
	negative: styles.seriesNegative,
	neutral: styles.seriesNeutral,
};
const IDENTITY_CLASSES = [
	styles.series1,
	styles.series2,
	styles.series3,
	styles.series4,
];
/** Where a band's centre sits within the band, as a share of its width. */
const BAND_CENTRE_SHARE = 0.5;

export function colourClass(series: ChartSeries, index: number): string {
	const slot = series.colour ?? (index % IDENTITY_CLASSES.length) + 1;
	return typeof slot === "string"
		? POLARITY_CLASSES[slot]
		: IDENTITY_CLASSES[slot - 1];
}

export function labelOf(series: ChartSeries): string {
	return series.label ?? series.key;
}

/** A bar, already placed. Precomputed rather than derived inside the render so
 *  the SVG stays a flat list of shapes. */
export type BarRect = {
	className: string;
	x: number;
	y: number;
	width: number;
	height: number;
	title: string;
};

/** A line or area series, already turned into path data. */
export type MarkPath = { className: string; line: string; area?: string };

/** The drawable area inside the padding, in the SVG's user units. */
type Plot = { x: number; y: number; w: number; h: number };

/** A series value's stacked bottom and top. */
type Cell = { base: number; top: number };

/** The chart's coordinate system, as accessors so every read stays tracked. */
export type ChartGeometry = {
	plot: () => Plot;
	/** Centre of the category band at `index`. Categories are bands rather
	 *  than points so bars have somewhere to sit; lines are read at the
	 *  centre. */
	bandCentre: (index: number) => number;
	yOf: (value: number) => number;
	cellAt: (rowIndex: number, seriesIndex: number) => Cell;
	formatted: (value: number) => string;
};

/** The plot's measured size, falling back to {@link ASSUMED}. */
export function createMeasuredSize(): {
	width: Accessor<number>;
	height: Accessor<number>;
	measure: (element: HTMLDivElement) => void;
} {
	const [width, setWidth] = createSignal(ASSUMED.width);
	const [height, setHeight] = createSignal(ASSUMED.height);

	function measure(element: HTMLDivElement): void {
		// Absent in jsdom and in any non-browser render. The assumed size above
		// is the whole fallback, so there is nothing else to do here.
		const Observer = (
			globalThis as { ResizeObserver?: typeof ResizeObserver }
		).ResizeObserver;
		if (!Observer) return;
		const observer = new Observer((entries) => {
			// `.at()`, not `[0]`: an empty entry list is possible and indexing
			// would type as always-present.
			const box = entries.at(0)?.contentRect;
			if (!box) return;
			if (box.width > 0) setWidth(box.width);
			if (box.height > 0) setHeight(box.height);
		});
		observer.observe(element);
		onCleanup(() => {
			observer.disconnect();
		});
	}

	return { width, height, measure };
}

/**
 * One column per bar STACK (or per unstacked bar series): stacked bars share
 * a column by definition, side-by-side bars each get their own. Bars share
 * the band only with each other, never with a line — a line is read at the
 * band centre, so letting bars claim the whole band would sit the line on
 * the edge of its own bar.
 */
function barColumnIds(series: ChartSeries[]): string[] {
	const columns: string[] = [];
	for (const entry of series) {
		if (entry.kind !== "bar") continue;
		const id = entry.stack ?? `solo:${entry.key}`;
		if (!columns.includes(id)) columns.push(id);
	}
	return columns;
}

function layoutBars(
	data: ChartDatum[],
	series: ChartSeries[],
	columns: string[],
	geometry: ChartGeometry
): BarRect[] {
	if (columns.length === 0) return [];
	const bandWidth = geometry.plot().w / Math.max(1, data.length);
	const usable = bandWidth * BAR_BAND_SHARE;
	const each = usable / columns.length;
	const rects: BarRect[] = [];
	series.forEach((entry, seriesIndex) => {
		if (entry.kind !== "bar") return;
		const column = Math.max(
			0,
			columns.indexOf(entry.stack ?? `solo:${entry.key}`)
		);
		const className = colourClass(entry, seriesIndex);
		data.forEach((row, rowIndex) => {
			const cell = geometry.cellAt(rowIndex, seriesIndex);
			// A zero-height bar is not a small bar, it is no bar; drawing one
			// would put a 1px tick on the axis for every empty category.
			if (cell.top <= cell.base) return;
			rects.push({
				className,
				x:
					geometry.bandCentre(rowIndex) -
					usable / 2 +
					each * column +
					1,
				y: geometry.yOf(cell.top),
				width: Math.max(1, each - 2),
				height: Math.max(
					1,
					geometry.yOf(cell.base) - geometry.yOf(cell.top)
				),
				title: `${labelOf(entry)}: ${geometry.formatted(numberAt(row, entry.key))}`,
			});
		});
	});
	return rects;
}

function layoutMarks(
	data: ChartDatum[],
	series: ChartSeries[],
	geometry: ChartGeometry
): MarkPath[] {
	return series
		.map((entry, seriesIndex) => ({ series: entry, seriesIndex }))
		.filter(({ series: entry }) => entry.kind !== "bar")
		.map(({ series: entry, seriesIndex }) => {
			const top = data.map(
				(_, index) =>
					`${String(geometry.bandCentre(index))},${String(geometry.yOf(geometry.cellAt(index, seriesIndex).top))}`
			);
			const line = top.length > 0 ? `M${top.join("L")}` : "";
			if (entry.kind !== "area") {
				return { className: colourClass(entry, seriesIndex), line };
			}
			// The underside walks the stack BASE back, not the axis: filling a
			// stacked area to zero would paint each band over the one below it.
			const under = data
				.map((_, index) => {
					const reversedIndex = data.length - 1 - index;
					return `${String(geometry.bandCentre(reversedIndex))},${String(geometry.yOf(geometry.cellAt(reversedIndex, seriesIndex).base))}`;
				})
				.join("L");
			return {
				className: colourClass(entry, seriesIndex),
				line,
				area: line === "" ? "" : `${line}L${under}Z`,
			};
		});
}

/** The chart's coordinate system, built from the data and the plot's size. */
export function createChartGeometry(
	props: {
		data: ChartDatum[];
		series: ChartSeries[];
		format?: (value: number) => string;
	},
	size: { width: Accessor<number>; height: Accessor<number> }
): { geometry: ChartGeometry; ticks: Accessor<number[]> } {
	const stacked = createMemo(() => stackRows(props.data, props.series));
	const scale = createMemo(() => niceScale(maxOf(stacked())));
	const plot = createMemo(() => ({
		x: PAD.left,
		y: PAD.top,
		w: Math.max(1, size.width() - PAD.left - PAD.right),
		h: Math.max(1, size.height() - PAD.top - PAD.bottom),
	}));

	const geometry: ChartGeometry = {
		plot,
		bandCentre(index) {
			const bounds = plot();
			return (
				bounds.x +
				(bounds.w / Math.max(1, props.data.length)) *
					(index + BAND_CENTRE_SHARE)
			);
		},
		yOf(value) {
			const bounds = plot();
			return bounds.y + bounds.h * (1 - value / scale().max);
		},
		cellAt(rowIndex, seriesIndex) {
			return stacked()[rowIndex]?.[seriesIndex] ?? { base: 0, top: 0 };
		},
		formatted(value) {
			return props.format ? props.format(value) : axisLabel(value);
		},
	};
	return { geometry, ticks: () => scale().ticks };
}

/** The hovered category, and the handlers that move and clear it. */
export function createHoverTracking(props: { data: ChartDatum[] }): {
	hover: Accessor<number | undefined>;
	hoveredRow: Accessor<ChartDatum | undefined>;
	onPointer: (event: PointerEvent) => void;
	clearHover: () => void;
} {
	const [hover, setHover] = createSignal<number>();

	/** The row under the pointer, or undefined when the pointer is elsewhere. */
	const hoveredRow = createMemo<ChartDatum | undefined>(() => {
		const index = hover();
		return index === undefined ? undefined : props.data[index];
	});

	function onPointer(event: PointerEvent): void {
		const box = (
			event.currentTarget as SVGRectElement
		).getBoundingClientRect();
		if (box.width === 0 || props.data.length === 0) return;
		const ratio = (event.clientX - box.left) / box.width;
		const index = Math.floor(ratio * props.data.length);
		setHover(Math.min(props.data.length - 1, Math.max(0, index)));
	}

	function clearHover(): void {
		setHover(undefined);
	}

	return { hover, hoveredRow, onPointer, clearHover };
}

/** The bars, and the line and area paths, laid out in the geometry. */
export function createChartShapes(
	props: { data: ChartDatum[]; series: ChartSeries[] },
	geometry: ChartGeometry
): { bars: Accessor<BarRect[]>; marks: Accessor<MarkPath[]> } {
	const barColumns = createMemo(() => barColumnIds(props.series));
	const bars = createMemo<BarRect[]>(() =>
		layoutBars(props.data, props.series, barColumns(), geometry)
	);
	const marks = createMemo<MarkPath[]>(() =>
		layoutMarks(props.data, props.series, geometry)
	);
	return { bars, marks };
}
