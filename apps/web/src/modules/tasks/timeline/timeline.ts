import type { Project } from "../data/tasksData.tsx";

export type ViewMode = "day" | "week" | "month";

const DAY = 86_400_000;

// Hard cap on how many days the timeline will ever lay out, so a pathological
// project (e.g. a 4000-year span from a fat-fingered date) can't generate
// millions of tick/month nodes and lock up the page.
const MAX_RANGE_DAYS = 366 * 6;

/** Pixels per day at each zoom level. */
export const DAY_WIDTH: Record<ViewMode, number> = {
	day: 34,
	week: 16,
	month: 5,
};

/** How many extra units (weeks for day/week, months for month) to pad on each
 * side of the data by default, so there is room to scroll from the first paint. */
export const DEFAULT_PAD: Record<ViewMode, number> = {
	day: 6,
	week: 8,
	month: 3,
};

/** Row + header heights (px), shared with the SCSS via inline custom properties. */
export const ROW_HEIGHT = 64;
export const MONTH_BAND_HEIGHT = 30;
export const TICK_ROW_HEIGHT = 26;
export const HEADER_HEIGHT = MONTH_BAND_HEIGHT + TICK_ROW_HEIGHT;

export type TimelineBar = {
	id: string;
	name: string;
	/** Days from the timeline's left edge to the bar's start. */
	offset: number;
	/** Bar length in days, inclusive of both endpoints. */
	span: number;
	/** Raw stored endpoints (UTC-midnight ms), used for drag/resize math. */
	startMs: number;
	endMs: number;
	/** Project leader, for the label card. */
	leaderId?: string;
};

export type TimelineSegment = {
	/** Stable key for `<For>`. */
	key: string;
	label: string;
	offset: number;
	span: number;
	/** Day-mode only: true for Saturday/Sunday columns (for weekend shading). */
	weekend?: boolean;
};

export type Timeline = {
	bars: TimelineBar[];
	/** Top header band: one cell per calendar month in range. */
	months: TimelineSegment[];
	/** Bottom axis row: days (day mode) or week-starts (week mode). Empty in
	 * month mode, where the months band is the only axis. */
	ticks: TimelineSegment[];
	/** Total timeline width in days. */
	totalDays: number;
	/** Pixels per day at the active zoom. */
	dayWidth: number;
	/** Day offset of today within range, or null when today is out of range. */
	todayOffset: number | null;
	/** UTC-midnight ms of the left edge (day offset 0), for mapping x → date. */
	rangeStartMs: number;
};

// Storage uses UTC-midnight ms, so every boundary is computed in UTC.
function startOfWeek(value: number): number {
	const dow = (new Date(value).getUTCDay() + 6) % 7; // Monday = 0
	return value - dow * DAY;
}
function startOfMonth(value: number): number {
	const d = new Date(value);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
/** First day of the month `n` months from the month containing `value`. */
function addMonths(value: number, n: number): number {
	const d = new Date(value);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
}
function startOfDay(value: number): number {
	const d = new Date(value);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function diffDays(from: number, to: number): number {
	return Math.round((to - from) / DAY);
}
function isWeekend(value: number): boolean {
	const dow = new Date(value).getUTCDay();
	return dow === 0 || dow === 6;
}

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
const WEEK_FMT = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
});

type DatedProject = Project & { startDate: number; endDate: number };

function datedProjects(projects: readonly Project[]): DatedProject[] {
	return projects
		.filter(
			(p): p is DatedProject =>
				p.startDate != null &&
				p.endDate != null &&
				p.endDate >= p.startDate
		)
		.sort((a, b) => a.startDate - b.startDate);
}

/** Projects that cannot be drawn as bars (a missing or inverted endpoint). */
export function undatedProjects(projects: readonly Project[]): Project[] {
	return projects.filter(
		(p) =>
			p.startDate == null || p.endDate == null || p.endDate < p.startDate
	);
}

/** Turn projects + zoom into render-ready geometry. `today` is passed in (not
 * read from the clock) so callers control it and tests stay deterministic.
 * `padBefore`/`padAfter` add extra units (weeks for day/week, months for month)
 * beyond the data on each side — the view grows these to fake infinite scroll.
 * Returns null when there is nothing to plot. */
export function buildTimeline(
	projects: readonly Project[],
	mode: ViewMode,
	today: number,
	padBefore = 0,
	padAfter = 0
): Timeline | null {
	const dated = datedProjects(projects);
	if (dated.length === 0) return null;

	// Clamp the data extent to a window around today before deriving the range, so
	// one pathological project (e.g. a start in year 202) can't drag the whole
	// axis 1800 years away from the projects that matter. Such a bar still renders
	// (clamped to the canvas), it just doesn't dictate the viewport.
	const halfWindow = (MAX_RANGE_DAYS / 2) * DAY;
	function clampToWindow(value: number): number {
		return Math.min(
			Math.max(value, today - halfWindow),
			today + halfWindow
		);
	}
	const minStart = clampToWindow(Math.min(...dated.map((p) => p.startDate)));
	const maxEnd = clampToWindow(Math.max(...dated.map((p) => p.endDate)));

	// Snap the visible range to whole weeks/months so gridlines fall on clean
	// boundaries; the base trailing pad keeps the last bar off the edge, and the
	// pad params add scroll room on top.
	let rangeStart: number;
	let rangeEnd: number;
	if (mode === "month") {
		rangeStart = addMonths(startOfMonth(minStart), -padBefore);
		rangeEnd = addMonths(startOfMonth(maxEnd), padAfter + 1) - DAY;
	} else {
		rangeStart = startOfWeek(minStart) - padBefore * 7 * DAY;
		rangeEnd = startOfWeek(maxEnd) + (padAfter + 1) * 7 * DAY - DAY;
	}

	// Clamp the laid-out span so a pathological project can't blow up the node
	// count. Bars past the cap stay positioned (offset/span keep their real
	// values) but the grid only renders ticks/months within the cap.
	const cap = rangeStart + (MAX_RANGE_DAYS - 1) * DAY;
	if (rangeEnd > cap) rangeEnd = cap;

	const totalDays = diffDays(rangeStart, rangeEnd) + 1;
	const dayWidth = DAY_WIDTH[mode];

	const bars: TimelineBar[] = dated.map((p) => ({
		id: p._id,
		name: p.name,
		offset: diffDays(rangeStart, p.startDate),
		span: diffDays(p.startDate, p.endDate) + 1,
		startMs: p.startDate,
		endMs: p.endDate,
		leaderId: p.leaderId,
	}));

	const months: TimelineSegment[] = [];
	for (
		let cur = startOfMonth(rangeStart);
		cur <= rangeEnd;
		cur = addMonths(cur, 1)
	) {
		const segStart = Math.max(cur, rangeStart);
		const segEnd = Math.min(addMonths(cur, 1) - DAY, rangeEnd);
		months.push({
			key: String(cur),
			label: MONTH_FMT.format(new Date(cur)),
			offset: diffDays(rangeStart, segStart),
			span: diffDays(segStart, segEnd) + 1,
		});
	}

	const ticks: TimelineSegment[] = [];
	if (mode === "day") {
		for (let d = 0; d < totalDays; d++) {
			const at = rangeStart + d * DAY;
			ticks.push({
				key: String(at),
				label: String(new Date(at).getUTCDate()),
				offset: d,
				span: 1,
				weekend: isWeekend(at),
			});
		}
	} else if (mode === "week") {
		for (let at = rangeStart; at <= rangeEnd; at += 7 * DAY) {
			const offset = diffDays(rangeStart, at);
			ticks.push({
				key: String(at),
				label: WEEK_FMT.format(new Date(at)),
				offset,
				span: Math.min(7, totalDays - offset),
			});
		}
	}

	const todayDay = startOfDay(today);
	const todayOffset =
		todayDay >= rangeStart && todayDay <= rangeEnd
			? diffDays(rangeStart, todayDay)
			: null;

	return {
		bars,
		months,
		ticks,
		totalDays,
		dayWidth,
		todayOffset,
		rangeStartMs: rangeStart,
	};
}
