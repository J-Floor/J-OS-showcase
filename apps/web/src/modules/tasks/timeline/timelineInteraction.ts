import {
	createEffect,
	createSignal,
	on,
	untrack,
	type Accessor,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { DAY_MS } from "../../../../convex/lib/constants.ts";
import type { Project } from "../data/tasksData.tsx";
import { useProjectActions } from "../data/tasksData.tsx";

import {
	DEFAULT_PAD,
	type Timeline,
	type TimelineBar,
	type ViewMode,
} from "./timeline.ts";

const EDGE = 240; // px from a scroll edge that triggers range growth
const CLICK_SLOP_PX = 4;
const MONTH_GROW_STEP = 2;
const WEEK_GROW_STEP = 6;
const JUMP_LEAD_DAYS = 2;

type DragKind = "move" | "start" | "end";
type Override = { startMs: number; endMs: number };

/** How far each side of the data the timeline is padded: a small left pad
 *  (first bar sits near the left edge on its own, no scroll-centering needed)
 *  and a generous right pad for future room. Both reset when the zoom
 *  changes. */
export function createTimelinePadding(options: { mode: Accessor<ViewMode> }) {
	const [padBefore, setPadBefore] = createSignal(1);
	const [padAfter, setPadAfter] = createSignal(
		untrack(() => DEFAULT_PAD[options.mode()])
	);

	// Reset padding + re-centre when the zoom changes.
	createEffect(
		on(
			options.mode,
			(mode) => {
				setPadBefore(1);
				setPadAfter(DEFAULT_PAD[mode]);
			},
			{ defer: true }
		)
	);
	return { padBefore, setPadBefore, padAfter, setPadAfter };
}

/** Optimistic dates for bars being dragged, so they don't snap back to the old
 *  position in the gap before Convex echoes the new dates. */
export function createProjectOverrides(options: {
	projects: Accessor<Project[] | undefined>;
}) {
	const [overrides, setOverrides] = createSignal<Record<string, Override>>(
		{}
	);

	// Drop optimistic overrides once the real Convex data matches them.
	createEffect(() => {
		const ov = overrides();
		const projects = options.projects() ?? [];
		const next = Object.fromEntries(
			Object.entries(ov).filter(([id, value]) => {
				const project = projects.find(
					(candidate) => candidate._id === id
				);
				return !(
					project?.startDate === value.startMs &&
					project.endDate === value.endMs
				);
			})
		);
		if (Object.keys(next).length !== Object.keys(ov).length)
			setOverrides(next);
	});

	return {
		setOverrides,
		/** The projects with any dragged bar's optimistic dates applied. */
		effective(): Project[] | undefined {
			const ov = overrides();
			const projects = options.projects();
			if (!projects || Object.keys(ov).length === 0) return projects;
			return projects.map((project) =>
				project._id in ov
					? {
							...project,
							startDate: ov[project._id].startMs,
							endDate: ov[project._id].endMs,
						}
					: project
			);
		},
	};
}

/** Scroll behaviour: grows the range when scrolled toward an edge, keeps the
 *  viewport anchored when it grows on the left, and jumps to today. */
export function createTimelineScroll(options: {
	mode: Accessor<ViewMode>;
	padding: ReturnType<typeof createTimelinePadding>;
	timeline: Accessor<Timeline | null>;
	/** Bumped by the toolbar "Today" button to recentre on today. */
	jumpToday: Accessor<number>;
}) {
	const { padding } = options;
	let scrollElement: HTMLDivElement | undefined;
	let growLeftFrom: number | null = null;

	function step(): number {
		return options.mode() === "month" ? MONTH_GROW_STEP : WEEK_GROW_STEP;
	}

	// Keep the viewport anchored when the range grows on the left.
	createEffect(
		on(padding.padBefore, () => {
			if (!(scrollElement && growLeftFrom !== null)) {
				return;
			}

			scrollElement.scrollLeft +=
				scrollElement.scrollWidth - growLeftFrom;
			growLeftFrom = null;
		})
	);

	// Scroll the given day offset toward the left of the viewport.
	function scrollToOffset(offset: number, dayWidth: number): void {
		if (scrollElement)
			scrollElement.scrollLeft = Math.max(
				0,
				(offset - JUMP_LEAD_DAYS) * dayWidth
			);
	}

	// "Jump to today" from the toolbar (bumped nonce).
	createEffect(
		on(
			() => options.jumpToday(),
			() => {
				const timeline = options.timeline();
				if (
					timeline?.todayOffset !== null &&
					timeline?.todayOffset !== undefined
				)
					scrollToOffset(timeline.todayOffset, timeline.dayWidth);
			},
			{ defer: true }
		)
	);

	return {
		scrollToOffset,
		setScrollElement: (element: HTMLDivElement): void => {
			scrollElement = element;
		},
		onScroll: (): void => {
			const element = scrollElement;
			if (!element) return;
			if (element.scrollLeft < EDGE) {
				growLeftFrom = element.scrollWidth;
				padding.setPadBefore((current) => current + step());
			} else if (
				element.scrollWidth - element.scrollLeft - element.clientWidth <
				EDGE
			) {
				padding.setPadAfter((current) => current + step());
			}
		},
	};
}

function dragKindOf(handle: string | undefined): DragKind {
	return handle === "start" || handle === "end" ? handle : "move";
}

/** The dates a bar ends up with after dragging it `deltaDays`. */
function draggedDates(
	info: { kind: DragKind; startMs: number; endMs: number },
	deltaDays: number
): Override {
	const shift = deltaDays * DAY_MS;
	if (info.kind === "move")
		return { startMs: info.startMs + shift, endMs: info.endMs + shift };
	if (info.kind === "start")
		return {
			startMs: Math.min(info.startMs + shift, info.endMs),
			endMs: info.endMs,
		};
	return {
		startMs: info.startMs,
		endMs: Math.max(info.endMs + shift, info.startMs),
	};
}

type LiveDrag = { id: Id<"projects">; kind: DragKind; dx: number } | null;

function barLeft(bar: TimelineBar, timeline: Timeline, drag: LiveDrag): number {
	const dayWidth = timeline.dayWidth;
	const totalW = timeline.totalDays * dayWidth;
	const dx =
		drag?.id === bar.id && (drag.kind === "move" || drag.kind === "start")
			? drag.dx
			: 0;
	// Clamp into the canvas (a bar from out-of-window data sits at the edge).
	return Math.min(Math.max(bar.offset * dayWidth + dx, -dayWidth), totalW);
}

function barWidth(
	bar: TimelineBar,
	timeline: Timeline,
	drag: LiveDrag
): number {
	const dayWidth = timeline.dayWidth;
	const totalW = timeline.totalDays * dayWidth;
	let width = bar.span * dayWidth;
	if (drag?.id === bar.id) {
		if (drag.kind === "start") width -= drag.dx;
		else if (drag.kind === "end") width += drag.dx;
	}
	// Clamp to the canvas so a capped/huge span can't produce a giant element.
	return Math.max(Math.min(width, totalW), dayWidth);
}

/** Dragging a bar to move it or resize either end; a near-stationary drag is
 *  a click that opens the project. */
export function createBarDrag(options: {
	timeline: Accessor<Timeline | null>;
	setOverrides: ReturnType<typeof createProjectOverrides>["setOverrides"];
	onSelect: (id: Id<"projects">) => void;
}) {
	const actions = useProjectActions();
	// Live pointer delta for the bar currently under drag.
	const [drag, setDrag] = createSignal<LiveDrag>(null);

	// Drag state held outside the signal so handlers can read the originals.
	let dragInfo: {
		id: Id<"projects">;
		kind: DragKind;
		startX: number;
		startMs: number;
		endMs: number;
	} | null = null;

	function commitDrag(
		info: NonNullable<typeof dragInfo>,
		deltaDays: number
	): void {
		const { startMs, endMs } = draggedDates(info, deltaDays);
		if (startMs === info.startMs && endMs === info.endMs) return;
		options.setOverrides((prev) => ({
			...prev,
			[info.id]: { startMs, endMs },
		}));
		void actions.update({
			id: info.id,
			startDate: startMs,
			endDate: endMs,
		});
	}

	return {
		barPointerDown: (event: PointerEvent, bar: TimelineBar): void => {
			const target = event.target as HTMLElement;
			const kind = dragKindOf(target.dataset.handle);
			const root = event.currentTarget as HTMLElement;
			root.setPointerCapture(event.pointerId);
			dragInfo = {
				id: bar.id,
				kind,
				startX: event.clientX,
				startMs: bar.startMs,
				endMs: bar.endMs,
			};
			setDrag({ id: bar.id, kind, dx: 0 });
		},

		barPointerMove: (event: PointerEvent): void => {
			if (dragInfo)
				setDrag({
					id: dragInfo.id,
					kind: dragInfo.kind,
					dx: event.clientX - dragInfo.startX,
				});
		},

		barPointerUp: (event: PointerEvent): void => {
			const info = dragInfo;
			dragInfo = null;
			setDrag(null);
			if (!info) return;
			const dx = event.clientX - info.startX;
			const dayWidth = options.timeline()?.dayWidth ?? 1;
			// A near-stationary pointer is a click → open the drawer.
			if (Math.abs(dx) < CLICK_SLOP_PX) {
				options.onSelect(info.id);
				return;
			}
			const deltaDays = Math.round(dx / dayWidth);
			if (deltaDays === 0) return;
			commitDrag(info, deltaDays);
		},

		barLeft: (bar: TimelineBar, timeline: Timeline): number =>
			barLeft(bar, timeline, drag()),

		barWidth: (bar: TimelineBar, timeline: Timeline): number =>
			barWidth(bar, timeline, drag()),
	};
}

/** The "New" row: drag across empty cells to create a project with that
 *  date range. */
export function createNewRangeDrag(options: {
	timeline: Accessor<Timeline | null>;
	/** Drag across the "New" row to create a project with that date range. */
	onCreateRange: (startMs: number, endMs: number) => void;
}) {
	const [newRange, setNewRange] = createSignal<{
		a: number;
		b: number;
	} | null>(null);
	let newAnchor: number | null = null;

	function offsetFromEvent(event: PointerEvent): number {
		const rect = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const dayWidth = options.timeline()?.dayWidth ?? 1;
		return Math.max(0, Math.floor((event.clientX - rect.left) / dayWidth));
	}

	return {
		newRange,
		newPointerDown: (event: PointerEvent): void => {
			(event.currentTarget as HTMLElement).setPointerCapture(
				event.pointerId
			);
			newAnchor = offsetFromEvent(event);
			setNewRange({ a: newAnchor, b: newAnchor });
		},
		newPointerMove: (event: PointerEvent): void => {
			if (newAnchor !== null)
				setNewRange({ a: newAnchor, b: offsetFromEvent(event) });
		},
		newPointerUp: (event: PointerEvent): void => {
			if (newAnchor === null) return;
			const anchor = newAnchor;
			const offset = offsetFromEvent(event);
			newAnchor = null;
			setNewRange(null);
			const timeline = options.timeline();
			if (!timeline) return;
			const lo = Math.min(anchor, offset);
			const hi = Math.max(anchor, offset);
			options.onCreateRange(
				timeline.rangeStartMs + lo * DAY_MS,
				timeline.rangeStartMs + hi * DAY_MS
			);
		},
	};
}
