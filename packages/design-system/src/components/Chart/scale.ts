/**
 * The pure geometry behind {@link Chart} — no DOM, no Solid, so it can be
 * tested directly rather than through a rendered SVG.
 */

/** One wide-format row: the x value plus one column per series. */
export type ChartDatum = Record<string, number | string>;

/** How a series is painted, and which identity it carries. */
export type ChartSeries = {
	/** The column in `data` this series plots. */
	key: string;
	/** Legend + tooltip label. Defaults to `key`. */
	label?: string;
	kind?: "line" | "bar" | "area";
	/**
	 * Identity (`1`–`4`, handed out in order) or polarity (`positive` /
	 * `negative` / `neutral`) for a series whose VALUE carries the meaning.
	 * Defaults to the slot matching the series' position.
	 */
	colour?: 1 | 2 | 3 | 4 | "positive" | "negative" | "neutral";
	/** Series sharing a `stack` are stacked on top of each other. */
	stack?: string;
};

/**
 * A "nice" upper bound and the ticks to go with it.
 *
 * Charts are read by comparing bar heights against gridlines, so the top of the
 * scale has to be a number a person can divide in their head — 40, not 37. The
 * step is the smallest of 1/2/2.5/5 × 10ⁿ that fits the data in at most
 * `maxTicks` intervals.
 */
export function niceScale(
	max: number,
	maxTicks = 4
): { max: number; ticks: number[] } {
	// An all-zero series still needs an axis; 0–1 is the smallest honest one.
	if (!Number.isFinite(max) || max <= 0) return { max: 1, ticks: [0, 1] };
	const raw = max / maxTicks;
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const normalised = raw / magnitude;
	const step =
		(normalised <= 1
			? 1
			: normalised <= 2
				? 2
				: normalised <= 2.5
					? 2.5
					: normalised <= 5
						? 5
						: 10) * magnitude;
	const top = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	// Accumulating `step` would drift on 2.5-sized steps; multiply instead.
	for (let i = 0; i * step <= top + step / 2; i++) ticks.push(i * step);
	return { max: top, ticks };
}

/** A number as it appears on an axis: compact above 10k, plain below. */
export function axisLabel(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
	if (abs >= 10_000) return `${trim(value / 1000)}k`;
	return trim(value);
}

function trim(value: number): string {
	// `toFixed(1)` on an integer gives "12.0"; drop the tail rather than show a
	// precision the number does not have.
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The stacked top and bottom of every series value, per row.
 *
 * Returned as an array parallel to `data` so a mark can be drawn straight from
 * it. Un-stacked series get `base: 0`; series sharing a `stack` accumulate in
 * the order they were declared, so re-ordering the series re-orders the stack —
 * which is the only sensible reading of "these are stacked".
 */
export function stackRows(
	data: ChartDatum[],
	series: ChartSeries[]
): { base: number; top: number }[][] {
	return data.map((row) => {
		const runningByStack = new Map<string, number>();
		return series.map((s) => {
			const value = numberAt(row, s.key);
			if (s.stack === undefined) return { base: 0, top: value };
			const base = runningByStack.get(s.stack) ?? 0;
			const top = base + value;
			runningByStack.set(s.stack, top);
			return { base, top };
		});
	});
}

/** A row's value for a series, as a number. Missing or non-numeric reads 0 —
 *  a gap in the data is not a reason to fail to draw the rest of the chart. */
export function numberAt(row: ChartDatum, key: string): number {
	const value = row[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The largest stacked top across every row, i.e. what the y axis must reach. */
export function maxOf(stacked: { base: number; top: number }[][]): number {
	let max = 0;
	for (const row of stacked)
		for (const cell of row) max = Math.max(max, cell.top);
	return max;
}
