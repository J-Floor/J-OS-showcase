import clsx from "clsx";
import {
	For,
	Show,
	createMemo,
	createSignal,
	onCleanup,
	type JSX,
} from "solid-js";

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

export type { ChartDatum, ChartSeries } from "./scale.ts";

export type ChartProps = {
	/** One row per x value; each row carries the x value plus every series' column. */
	data: ChartDatum[];
	/** The column holding the x value. */
	xKey: string;
	/**
	 * What to draw, in order. The first four un-coloured series take the four
	 * categorical slots; a fifth needs an explicit `colour`, because cycling the
	 * hues would give two different series the same identity.
	 */
	series: ChartSeries[];
	/**
	 * What the chart is, for anyone who cannot see it. Also names the
	 * screen-reader table that mirrors the plot, so it is required rather than
	 * optional — a chart nobody can read is not finished.
	 */
	label: string;
	/** Format a value for the tooltip and the accessible table. */
	format?: (value: number) => string;
	/**
	 * Hide the legend. Only legitimate for a single series, where the chart's
	 * own heading already names it — which is why the legend is suppressed
	 * automatically in that case and this prop is rarely needed.
	 */
	hideLegend?: boolean;
	/** Shown in place of the plot when `data` is empty. */
	emptyMessage?: string;
	class?: string;
};

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

function colourClass(series: ChartSeries, index: number): string {
	const slot = series.colour ?? (index % 4) + 1;
	switch (slot) {
		case "positive":
			return styles.seriesPositive;
		case "negative":
			return styles.seriesNegative;
		case "neutral":
			return styles.seriesNeutral;
		case 1:
			return styles.series1;
		case 2:
			return styles.series2;
		case 3:
			return styles.series3;
		default:
			return styles.series4;
	}
}

/** A bar, already placed. Precomputed rather than derived inside the render so
 *  the SVG stays a flat list of shapes. */
type BarRect = {
	klass: string;
	x: number;
	y: number;
	width: number;
	height: number;
	title: string;
};

/** A line or area series, already turned into path data. */
type MarkPath = { klass: string; line: string; area?: string };

/**
 * A small multi-series chart: lines, areas and bars over a shared category
 * axis, in the design system's validated series palette.
 *
 * Series are declared as DATA (`series={[…]}`), not as child elements. Solid
 * evaluates JSX eagerly, so the React trick of reading marker children back out
 * of `props.children` has nothing to read — and a plain array is easier to
 * derive from a query anyway, which is what every caller is doing.
 *
 * ONE Y AXIS, always. Two measures on different scales belong in two charts; a
 * second axis lets the author decide where the lines cross, which is not a
 * property of the data.
 */
export function Chart(props: ChartProps): JSX.Element {
	const [width, setWidth] = createSignal(ASSUMED.width);
	const [height, setHeight] = createSignal(ASSUMED.height);
	const [hover, setHover] = createSignal<number>();

	function measure(el: HTMLDivElement): void {
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
		observer.observe(el);
		onCleanup(() => {
			observer.disconnect();
		});
	}

	const stacked = createMemo(() => stackRows(props.data, props.series));
	const scale = createMemo(() => niceScale(maxOf(stacked())));
	const plot = createMemo(() => ({
		x: PAD.left,
		y: PAD.top,
		w: Math.max(1, width() - PAD.left - PAD.right),
		h: Math.max(1, height() - PAD.top - PAD.bottom),
	}));

	/** Centre of the category band at `index`. Categories are bands rather than
	 *  points so bars have somewhere to sit; lines are read at the centre. */
	function bandCentre(index: number): number {
		const p = plot();
		return p.x + (p.w / Math.max(1, props.data.length)) * (index + 0.5);
	}
	function yOf(value: number): number {
		const p = plot();
		return p.y + p.h * (1 - value / scale().max);
	}
	function cellAt(
		rowIndex: number,
		seriesIndex: number
	): {
		base: number;
		top: number;
	} {
		return stacked()[rowIndex]?.[seriesIndex] ?? { base: 0, top: 0 };
	}
	function formatted(value: number): string {
		return props.format ? props.format(value) : axisLabel(value);
	}
	function labelOf(series: ChartSeries): string {
		return series.label ?? series.key;
	}

	/**
	 * One column per bar STACK (or per unstacked bar series): stacked bars share
	 * a column by definition, side-by-side bars each get their own. Bars share
	 * the band only with each other, never with a line — a line is read at the
	 * band centre, so letting bars claim the whole band would sit the line on
	 * the edge of its own bar.
	 */
	const barColumns = createMemo(() => {
		const columns: string[] = [];
		for (const s of props.series) {
			if (s.kind !== "bar") continue;
			const id = s.stack ?? `solo:${s.key}`;
			if (!columns.includes(id)) columns.push(id);
		}
		return columns;
	});

	const bars = createMemo<BarRect[]>(() => {
		const columns = barColumns();
		if (columns.length === 0) return [];
		const bandWidth = plot().w / Math.max(1, props.data.length);
		const usable = bandWidth * BAR_BAND_SHARE;
		const each = usable / columns.length;
		const rects: BarRect[] = [];
		props.series.forEach((series, seriesIndex) => {
			if (series.kind !== "bar") return;
			const column = Math.max(
				0,
				columns.indexOf(series.stack ?? `solo:${series.key}`)
			);
			const klass = colourClass(series, seriesIndex);
			props.data.forEach((row, rowIndex) => {
				const cell = cellAt(rowIndex, seriesIndex);
				// A zero-height bar is not a small bar, it is no bar; drawing one
				// would put a 1px tick on the axis for every empty category.
				if (cell.top <= cell.base) return;
				rects.push({
					klass,
					x: bandCentre(rowIndex) - usable / 2 + each * column + 1,
					y: yOf(cell.top),
					width: Math.max(1, each - 2),
					height: Math.max(1, yOf(cell.base) - yOf(cell.top)),
					title: `${labelOf(series)}: ${formatted(numberAt(row, series.key))}`,
				});
			});
		});
		return rects;
	});

	const marks = createMemo<MarkPath[]>(() =>
		props.series
			.map((series, seriesIndex) => ({ series, seriesIndex }))
			.filter(({ series }) => series.kind !== "bar")
			.map(({ series, seriesIndex }) => {
				const top = props.data.map(
					(_, i) =>
						`${String(bandCentre(i))},${String(yOf(cellAt(i, seriesIndex).top))}`
				);
				const line = top.length > 0 ? `M${top.join("L")}` : "";
				if (series.kind !== "area") {
					return { klass: colourClass(series, seriesIndex), line };
				}
				// The underside walks the stack BASE back, not the axis: filling a
				// stacked area to zero would paint each band over the one below it.
				const under = props.data
					.map((_, i) => {
						const j = props.data.length - 1 - i;
						return `${String(bandCentre(j))},${String(yOf(cellAt(j, seriesIndex).base))}`;
					})
					.join("L");
				return {
					klass: colourClass(series, seriesIndex),
					line,
					area: line === "" ? "" : `${line}L${under}Z`,
				};
			})
	);

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

	return (
		<figure class={clsx(styles.root, props.class)}>
			<Show
				when={props.data.length > 0}
				fallback={
					<p class={styles.empty}>
						{props.emptyMessage ?? "Nothing to show yet."}
					</p>
				}
			>
				<div class={styles.plot} ref={measure}>
					<svg
						class={styles.svg}
						viewBox={`0 0 ${String(width())} ${String(height())}`}
						role="img"
						aria-label={props.label}
					>
						<For each={scale().ticks}>
							{(tick) => (
								<>
									<line
										class={styles.grid}
										x1={plot().x}
										x2={plot().x + plot().w}
										y1={yOf(tick)}
										y2={yOf(tick)}
									/>
									<text
										class={styles.tick}
										x={plot().x - 6}
										y={yOf(tick)}
										text-anchor="end"
										dominant-baseline="middle"
									>
										{axisLabel(tick)}
									</text>
								</>
							)}
						</For>
						<For each={marks()}>
							{(mark) => (
								<g class={mark.klass}>
									<Show when={mark.area}>
										{(d) => (
											<path class={styles.area} d={d()} />
										)}
									</Show>
									<path class={styles.line} d={mark.line} />
								</g>
							)}
						</For>
						<For each={bars()}>
							{(bar) => (
								<rect
									class={clsx(styles.bar, bar.klass)}
									x={bar.x}
									y={bar.y}
									width={bar.width}
									height={bar.height}
									rx="2"
								>
									<title>{bar.title}</title>
								</rect>
							)}
						</For>
						{/* Gated on the ROW, not on the index: index 0 is a perfectly
						    good hover and `<Show when={0}>` renders nothing. */}
						<Show when={hoveredRow()}>
							<line
								class={styles.crosshair}
								x1={bandCentre(hover() ?? 0)}
								x2={bandCentre(hover() ?? 0)}
								y1={plot().y}
								y2={plot().y + plot().h}
							/>
						</Show>
						<For each={props.data}>
							{(row, i) => (
								<Show
									when={
										// Label every category while they fit, then
										// every other one: an axis that overlaps
										// itself is less readable than half an axis.
										props.data.length <= 8 || i() % 2 === 0
									}
								>
									<text
										class={styles.tick}
										x={bandCentre(i())}
										y={plot().y + plot().h + 14}
										text-anchor="middle"
									>
										{String(row[props.xKey])}
									</text>
								</Show>
							)}
						</For>
						<rect
							class={styles.hitArea}
							x={plot().x}
							y={plot().y}
							width={plot().w}
							height={plot().h}
							onPointerMove={onPointer}
							onPointerLeave={() => {
								setHover(undefined);
							}}
						/>
					</svg>
					<Show when={hoveredRow()}>
						{(row) => (
							<div
								class={styles.tooltip}
								data-side={
									(hover() ?? 0) > props.data.length / 2
										? "start"
										: "end"
								}
							>
								<span class={styles.tooltipLabel}>
									{String(row()[props.xKey])}
								</span>
								<For each={props.series}>
									{(series, index) => (
										<span class={styles.tooltipRow}>
											<span
												class={clsx(
													styles.swatch,
													colourClass(series, index())
												)}
											/>
											{labelOf(series)}
											<span class={styles.tooltipValue}>
												{formatted(
													numberAt(row(), series.key)
												)}
											</span>
										</span>
									)}
								</For>
							</div>
						)}
					</Show>
				</div>
				<Show when={!props.hideLegend && props.series.length > 1}>
					<ul class={styles.legend}>
						<For each={props.series}>
							{(series, index) => (
								<li class={styles.legendItem}>
									<span
										class={clsx(
											styles.swatch,
											colourClass(series, index())
										)}
									/>
									{labelOf(series)}
								</li>
							)}
						</For>
					</ul>
				</Show>
				{/*
				 * The same numbers as a table, for screen readers and for anyone
				 * who cannot separate the hues. Not an extra: identity in a chart
				 * must never rest on colour alone, and this guarantees it for
				 * every chart in the app at once.
				 */}
				<table class={styles.srTable}>
					<caption>{props.label}</caption>
					<thead>
						<tr>
							<th scope="col">{props.xKey}</th>
							<For each={props.series}>
								{(series) => (
									<th scope="col">{labelOf(series)}</th>
								)}
							</For>
						</tr>
					</thead>
					<tbody>
						<For each={props.data}>
							{(row) => (
								<tr>
									<th scope="row">
										{String(row[props.xKey])}
									</th>
									<For each={props.series}>
										{(series) => (
											<td>
												{formatted(
													numberAt(row, series.key)
												)}
											</td>
										)}
									</For>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</Show>
		</figure>
	);
}
