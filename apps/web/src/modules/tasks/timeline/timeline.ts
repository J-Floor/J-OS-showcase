import { DAY_MS, DAYS_PER_WEEK } from "../../../../convex/lib/constants.ts";
import type { Project } from "../data/tasksData.tsx";

/** The zoom levels, in the order the view picker lists them. */
export const VIEW_OPTIONS = [
	{ value: "day", label: "Day" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
] as const;

export type ViewMode = (typeof VIEW_OPTIONS)[number]["value"];

const DAYS_PER_LEAP_YEAR = 366;
const MAX_RANGE_YEARS = 6;
const SATURDAY = 6;

// Hard cap on how many days the timeline will ever lay out, so a pathological
// project (e.g. a 4000-year span from a fat-fingered date) can't generate
// millions of tick/month nodes and lock up the page.
const MAX_RANGE_DAYS = DAYS_PER_LEAP_YEAR * MAX_RANGE_YEARS;

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

/** One project's bar: its name and leader (for the label card) plus where it
 *  sits on the timeline. */
export type TimelineBar = Pick<Project, "name" | "leaderId"> & {
	id: Project["_id"];
	/** Days from the timeline's left edge to the bar's start. */
	offset: number;
	/** Bar length in days, inclusive of both endpoints. */
	span: number;
	/** Raw stored endpoints (UTC-midnight ms), used for drag/resize math. */
	startMs: number;
	endMs: number;
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
	const dow =
		(new Date(value).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK; // Monday = 0
	return value - dow * DAY_MS;
}
function startOfMonth(value: number): number {
	const date = new Date(value);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}
/** First day of the month `n` months from the month containing `value`. */
function addMonths(value: number, months: number): number {
	const date = new Date(value);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}
function startOfDay(value: number): number {
	const date = new Date(value);
	return Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate()
	);
}
function diffDays(from: number, to: number): number {
	return Math.round((to - from) / DAY_MS);
}
function isWeekend(value: number): boolean {
	const dow = new Date(value).getUTCDay();
	return dow === 0 || dow === SATURDAY;
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
	return (
		projects
			.filter(
				(project): project is DatedProject =>
					project.startDate !== undefined &&
					project.endDate !== undefined &&
					project.endDate >= project.startDate
			)
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => a.startDate - b.startDate)
	);
}

/** Projects that cannot be drawn as bars (a missing or inverted endpoint). */
export function undatedProjects(projects: readonly Project[]): Project[] {
	return projects.filter(
		(project) =>
			project.startDate === undefined ||
			project.endDate === undefined ||
			project.endDate < project.startDate
	);
}

/** The laid-out range as UTC-midnight ms, both ends inclusive. */
type Range = { start: number; end: number };

/** The range the timeline lays out: the data extent, clamped to a window
 *  around `today` and always reaching today, snapped to whole weeks/months,
 *  padded for scroll room, and capped. */
function visibleRange(
	dated: DatedProject[],
	mode: ViewMode,
	today: number,
	pad: { before: number; after: number }
): Range {
	// Clamp the data extent to a window around today before deriving the range, so
	// one pathological project (e.g. a start in year 202) can't drag the whole
	// axis 1800 years away from the projects that matter. Such a bar still renders
	// (clamped to the canvas), it just doesn't dictate the viewport.
	const halfWindow = (MAX_RANGE_DAYS / 2) * DAY_MS;
	function clampToWindow(value: number): number {
		return Math.min(
			Math.max(value, today - halfWindow),
			today + halfWindow
		);
	}
	// Today is part of the extent, so the timeline can open on it even when
	// every project is in the past or the future.
	const minStart = Math.min(
		today,
		clampToWindow(Math.min(...dated.map((project) => project.startDate)))
	);
	const maxEnd = Math.max(
		today,
		clampToWindow(Math.max(...dated.map((project) => project.endDate)))
	);

	// Snap the visible range to whole weeks/months so gridlines fall on clean
	// boundaries; the base trailing pad keeps the last bar off the edge, and the
	// pad params add scroll room on top.
	let start: number;
	let end: number;
	if (mode === "month") {
		start = addMonths(startOfMonth(minStart), -pad.before);
		end = addMonths(startOfMonth(maxEnd), pad.after + 1) - DAY_MS;
	} else {
		start = startOfWeek(minStart) - pad.before * DAYS_PER_WEEK * DAY_MS;
		end =
			startOfWeek(maxEnd) +
			(pad.after + 1) * DAYS_PER_WEEK * DAY_MS -
			DAY_MS;
	}

	// Clamp the laid-out span so a pathological project can't blow up the node
	// count. Bars past the cap stay positioned (offset/span keep their real
	// values) but the grid only renders ticks/months within the cap.
	const cap = start + (MAX_RANGE_DAYS - 1) * DAY_MS;
	return { start, end: Math.min(end, cap) };
}

/** One cell per calendar month in range. */
function monthSegments(range: Range): TimelineSegment[] {
	const months: TimelineSegment[] = [];
	for (
		let current = startOfMonth(range.start);
		current <= range.end;
		current = addMonths(current, 1)
	) {
		const segStart = Math.max(current, range.start);
		const segEnd = Math.min(addMonths(current, 1) - DAY_MS, range.end);
		months.push({
			key: String(current),
			label: MONTH_FMT.format(new Date(current)),
			offset: diffDays(range.start, segStart),
			span: diffDays(segStart, segEnd) + 1,
		});
	}
	return months;
}

/** The bottom axis: a cell per day (day mode) or per week start (week mode);
 *  none in month mode. */
function tickSegments(
	mode: ViewMode,
	range: Range,
	totalDays: number
): TimelineSegment[] {
	const ticks: TimelineSegment[] = [];
	if (mode === "day") {
		for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
			const at = range.start + dayIndex * DAY_MS;
			ticks.push({
				key: String(at),
				label: String(new Date(at).getUTCDate()),
				offset: dayIndex,
				span: 1,
				weekend: isWeekend(at),
			});
		}
	} else if (mode === "week") {
		for (
			let at = range.start;
			at <= range.end;
			at += DAYS_PER_WEEK * DAY_MS
		) {
			const offset = diffDays(range.start, at);
			ticks.push({
				key: String(at),
				label: WEEK_FMT.format(new Date(at)),
				offset,
				span: Math.min(DAYS_PER_WEEK, totalDays - offset),
			});
		}
	}
	return ticks;
}

/** Turn projects + zoom into render-ready geometry. `today` is passed in (not
 * read from the clock) so callers control it and tests stay deterministic.
 * `pad.before`/`pad.after` add extra units (weeks for day/week, months for
 * month) beyond the data on each side — the view grows these to fake infinite
 * scroll. Returns null when there is nothing to plot. */
export function buildTimeline(
	projects: readonly Project[],
	mode: ViewMode,
	today: number,
	pad: { before: number; after: number } = { before: 0, after: 0 }
): Timeline | null {
	const dated = datedProjects(projects);
	if (dated.length === 0) return null;

	const range = visibleRange(dated, mode, today, pad);
	const totalDays = diffDays(range.start, range.end) + 1;

	const bars: TimelineBar[] = dated.map((project) => ({
		id: project._id,
		name: project.name,
		offset: diffDays(range.start, project.startDate),
		span: diffDays(project.startDate, project.endDate) + 1,
		startMs: project.startDate,
		endMs: project.endDate,
		leaderId: project.leaderId,
	}));

	const todayDay = startOfDay(today);
	const todayOffset =
		todayDay >= range.start && todayDay <= range.end
			? diffDays(range.start, todayDay)
			: null;

	return {
		bars,
		months: monthSegments(range),
		ticks: tickSegments(mode, range, totalDays),
		totalDays,
		dayWidth: DAY_WIDTH[mode],
		todayOffset,
		rangeStartMs: range.start,
	};
}
