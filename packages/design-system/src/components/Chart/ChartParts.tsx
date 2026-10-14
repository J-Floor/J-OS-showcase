import clsx from "clsx";
import { For, Show, type JSX } from "solid-js";

import styles from "./Chart.module.scss";
import {
	colourClass,
	labelOf,
	type BarRect,
	type ChartGeometry,
	type MarkPath,
} from "./chartLayout.ts";
import {
	axisLabel,
	numberAt,
	type ChartDatum,
	type ChartSeries,
} from "./scale.ts";

/** The parts of a `Chart`, each a plain render of what the layout hands it. */

/** How far left of the plot a y-axis label sits. */
const TICK_LABEL_GAP = 6;
/** How far below the plot a category label sits. */
const CATEGORY_LABEL_DROP = 14;
/** Categories up to this many are all labelled; past it, every other one. */
const MAX_ALL_LABELLED_CATEGORIES = 8;

/** The horizontal gridlines and their y-axis labels. */
export function GridLines(props: {
	ticks: number[];
	geometry: ChartGeometry;
}): JSX.Element {
	return (
		<For each={props.ticks}>
			{(tick) => (
				<>
					<line
						class={styles.grid}
						x1={props.geometry.plot().x}
						x2={props.geometry.plot().x + props.geometry.plot().w}
						y1={props.geometry.yOf(tick)}
						y2={props.geometry.yOf(tick)}
					/>
					<text
						class={styles.tick}
						x={props.geometry.plot().x - TICK_LABEL_GAP}
						y={props.geometry.yOf(tick)}
						text-anchor="end"
						dominant-baseline="middle"
					>
						{axisLabel(tick)}
					</text>
				</>
			)}
		</For>
	);
}

/** The line and area series, then the bars. */
export function Marks(props: {
	marks: MarkPath[];
	bars: BarRect[];
}): JSX.Element {
	return (
		<>
			<For each={props.marks}>
				{(mark) => (
					<g class={mark.className}>
						<Show when={mark.area}>
							{(areaPath) => (
								<path class={styles.area} d={areaPath()} />
							)}
						</Show>
						<path class={styles.line} d={mark.line} />
					</g>
				)}
			</For>
			<For each={props.bars}>
				{(bar) => (
					<rect
						class={clsx(styles.bar, bar.className)}
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
		</>
	);
}

/** The x-axis labels. */
export function CategoryLabels(props: {
	data: ChartDatum[];
	xKey: string;
	geometry: ChartGeometry;
}): JSX.Element {
	return (
		<For each={props.data}>
			{(row, index) => (
				<Show
					when={
						// Label every category while they fit, then
						// every other one: an axis that overlaps
						// itself is less readable than half an axis.
						props.data.length <= MAX_ALL_LABELLED_CATEGORIES ||
						index() % 2 === 0
					}
				>
					<text
						class={styles.tick}
						x={props.geometry.bandCentre(index())}
						y={
							props.geometry.plot().y +
							props.geometry.plot().h +
							CATEGORY_LABEL_DROP
						}
						text-anchor="middle"
					>
						{String(row[props.xKey])}
					</text>
				</Show>
			)}
		</For>
	);
}

/** The values of the hovered row, one line per series. */
export function HoverTooltip(props: {
	row: ChartDatum;
	hover: number | undefined;
	data: ChartDatum[];
	xKey: string;
	series: ChartSeries[];
	formatted: (value: number) => string;
}): JSX.Element {
	return (
		<div
			class={styles.tooltip}
			data-side={
				(props.hover ?? 0) > props.data.length / 2 ? "start" : "end"
			}
		>
			<span class={styles.tooltipLabel}>
				{String(props.row[props.xKey])}
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
							{props.formatted(numberAt(props.row, series.key))}
						</span>
					</span>
				)}
			</For>
		</div>
	);
}

export function Legend(props: { series: ChartSeries[] }): JSX.Element {
	return (
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
	);
}

/**
 * The same numbers as a table, for screen readers and for anyone who cannot
 * separate the hues. Not an extra: identity in a chart must never rest on
 * colour alone, and this guarantees it for every chart in the app at once.
 */
export function AccessibleTable(props: {
	label: string;
	data: ChartDatum[];
	xKey: string;
	series: ChartSeries[];
	formatted: (value: number) => string;
}): JSX.Element {
	return (
		<table class={styles.srTable}>
			<caption>{props.label}</caption>
			<thead>
				<tr>
					<th scope="col">{props.xKey}</th>
					<For each={props.series}>
						{(series) => <th scope="col">{labelOf(series)}</th>}
					</For>
				</tr>
			</thead>
			<tbody>
				<For each={props.data}>
					{(row) => (
						<tr>
							<th scope="row">{String(row[props.xKey])}</th>
							<For each={props.series}>
								{(series) => (
									<td>
										{props.formatted(
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
	);
}
