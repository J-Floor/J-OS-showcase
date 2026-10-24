import clsx from "clsx";
import { Show, type JSX } from "solid-js";

import { createSlotPart } from "../../utils/presence.tsx";

import styles from "./Chart.module.scss";
import {
	createChartGeometry,
	createChartShapes,
	createHoverTracking,
	createMeasuredSize,
} from "./chartLayout.ts";
import {
	AccessibleTable,
	CategoryLabels,
	GridLines,
	HoverTooltip,
	Legend,
	Marks,
} from "./ChartParts.tsx";
import type { ChartDatum, ChartSeries } from "./scale.ts";

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
	/** Parts: a `Chart.Empty` replaces the default empty message. */
	children?: JSX.Element;
	class?: string;
};

/** `Chart.Empty`: shown in place of the plot when `data` is empty, instead
 *  of the default message. */
const emptyPart = createSlotPart("Chart", "Empty", "Chart");

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
	return (
		<emptyPart.Scope>
			{props.children}
			<ChartFigure {...props} />
		</emptyPart.Scope>
	);
}

Chart.Empty = emptyPart.Part;

/** The plot, or the empty content when there is no data. */
function ChartFigure(props: ChartProps): JSX.Element {
	const size = createMeasuredSize();
	const { geometry, ticks } = createChartGeometry(props, size);
	const { hover, hoveredRow, onPointer, clearHover } =
		createHoverTracking(props);

	const { bars, marks } = createChartShapes(props, geometry);

	return (
		<figure class={clsx(styles.root, props.class)}>
			<Show
				when={props.data.length > 0}
				fallback={
					<div class={styles.empty}>
						<emptyPart.Slot fallback="Nothing to show yet." />
					</div>
				}
			>
				<div class={styles.plot} ref={size.measure}>
					<svg
						class={styles.svg}
						viewBox={`0 0 ${String(size.width())} ${String(size.height())}`}
						role="img"
						aria-label={props.label}
					>
						<GridLines ticks={ticks()} geometry={geometry} />
						<Marks marks={marks()} bars={bars()} />
						{/* Gated on the ROW, not on the index: index 0 is a perfectly
						    good hover and `<Show when={0}>` renders nothing. */}
						<Show when={hoveredRow()}>
							<line
								class={styles.crosshair}
								x1={geometry.bandCentre(hover() ?? 0)}
								x2={geometry.bandCentre(hover() ?? 0)}
								y1={geometry.plot().y}
								y2={geometry.plot().y + geometry.plot().h}
							/>
						</Show>
						<CategoryLabels
							data={props.data}
							xKey={props.xKey}
							geometry={geometry}
						/>
						<rect
							class={styles.hitArea}
							x={geometry.plot().x}
							y={geometry.plot().y}
							width={geometry.plot().w}
							height={geometry.plot().h}
							onPointerMove={onPointer}
							onPointerLeave={clearHover}
						/>
					</svg>
					<Show when={hoveredRow()}>
						{(row) => (
							<HoverTooltip
								row={row()}
								hover={hover()}
								data={props.data}
								xKey={props.xKey}
								series={props.series}
								formatted={geometry.formatted}
							/>
						)}
					</Show>
				</div>
				<Show when={!props.hideLegend && props.series.length > 1}>
					<Legend series={props.series} />
				</Show>
				<AccessibleTable
					label={props.label}
					data={props.data}
					xKey={props.xKey}
					series={props.series}
					formatted={geometry.formatted}
				/>
			</Show>
		</figure>
	);
}
