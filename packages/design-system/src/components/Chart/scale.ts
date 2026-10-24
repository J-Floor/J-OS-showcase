/**
 * The pure geometry behind {@link Chart} — no DOM, no Solid, so it can be
 * tested directly rather than through a rendered SVG.
 */

/** One wide-format row: the x value plus one column per series. */
export type ChartDatum = Record<string, number | string>;

/** The identity colour slots, handed out in order. */
type IdentitySlot = 1 | 2 | 3 | 4;

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
	colour?: IdentitySlot | "positive" | "negative" | "neutral";
	/** Series sharing a `stack` are stacked on top of each other. */
	stack?: string;
};

const DECIMAL_BASE = 10;
const QUARTER_DECADE = 2.5;
const HALF_DECADE = 5;
const NICE_MULTIPLIERS = [1, 2, QUARTER_DECADE, HALF_DECADE, DECIMAL_BASE];
const MILLION = 1_000_000;
const TEN_THOUSAND = 10_000;
const THOUSAND = 1000;

/** The smallest of 1/2/2.5/5/10 that is at least `normalised` (1 up to 10). */
function niceMultiplier(normalised: number): number {
	return (
		NICE_MULTIPLIERS.find((multiplier) => normalised <= multiplier) ??
		NICE_MULTIPLIERS[NICE_MULTIPLIERS.length - 1]
	);
}

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
	const magnitude = DECIMAL_BASE ** Math.floor(Math.log10(raw));
	const normalised = raw / magnitude;
	const step = niceMultiplier(normalised) * magnitude;
	const top = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	// Accumulating `step` would drift on 2.5-sized steps; multiply instead.
	for (let index = 0; index * step <= top + step / 2; index++)
		ticks.push(index * step);
	return { max: top, ticks };
}

/** A number as it appears on an axis: compact above 10k, plain below. */
export function axisLabel(value: number): string {
	const abs = Math.abs(value);
	if (abs >= MILLION) return `${trim(value / MILLION)}M`;
	return abs >= TEN_THOUSAND ? `${trim(value / THOUSAND)}k` : trim(value);
}

function trim(value: number): string {
	// `toFixed(1)` on an integer gives "12.0"; drop the tail rather than show a
	// precision the number does not have.
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A series value's stacked bottom and top. */
export type StackedCell = { base: number; top: number };

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
): StackedCell[][] {
	return data.map((row) => {
		const runningByStack = new Map<string, number>();
		return series.map((entry) => {
			const value = numberAt(row, entry.key);
			if (entry.stack === undefined) return { base: 0, top: value };
			const base = runningByStack.get(entry.stack) ?? 0;
			const top = base + value;
			runningByStack.set(entry.stack, top);
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
export function maxOf(stacked: StackedCell[][]): number {
	let max = 0;
	for (const row of stacked)
		for (const cell of row) max = Math.max(max, cell.top);
	return max;
}
