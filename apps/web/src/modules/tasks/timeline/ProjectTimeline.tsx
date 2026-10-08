import { Icon, IconButton } from "@j-os/design-system";
import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	untrack,
	type Accessor,
	type JSX,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { ICONS } from "../../../shared/icons.ts";
import { personName } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useProjectActions } from "../data/tasksData.tsx";
import { ProjectCard } from "../ProjectCard.tsx";

import styles from "./ProjectTimeline.module.scss";
import {
	DEFAULT_PAD,
	HEADER_HEIGHT,
	MONTH_BAND_HEIGHT,
	ROW_HEIGHT,
	TICK_ROW_HEIGHT,
	buildTimeline,
	type Timeline,
	type TimelineBar,
	type ViewMode,
} from "./timeline.ts";

const DAY = 86_400_000;
const EDGE = 240; // px from a scroll edge that triggers range growth
const CLICK_SLOP = 4; // px of pointer travel still treated as a click

const LABEL_WIDTH = 248;

type DragKind = "move" | "start" | "end";
type Override = { startMs: number; endMs: number };

function px(value: number): string {
	return `${String(value)}px`;
}

export function ProjectTimeline(props: {
	projects: Project[];
	people: Person[];
	tasks: Task[];
	mode: ViewMode;
	/** Bumped by the toolbar "Today" button to recentre on today. */
	jumpToday: Accessor<number>;
	onSelect: (id: Id<"projects">) => void;
	/** Drag across the "New" row to create a project with that date range. */
	onCreateRange: (startMs: number, endMs: number) => void;
}): JSX.Element {
	const actions = useProjectActions();

	function mode(): ViewMode {
		return props.mode;
	}

	// Start with a small left pad (first bar sits near the left edge on its own,
	// no scroll-centering needed) and a generous right pad for future room. Both
	// sides then grow on demand as the user scrolls toward an edge.
	const [padBefore, setPadBefore] = createSignal(1);
	const [padAfter, setPadAfter] = createSignal(
		untrack(() => DEFAULT_PAD[props.mode])
	);
	// Optimistic dates for bars being dragged, so they don't snap back to the old
	// position in the gap before Convex echoes the new dates.
	const [overrides, setOverrides] = createSignal<Record<string, Override>>(
		{}
	);
	// Live pointer delta for the bar currently under drag.
	const [drag, setDrag] = createSignal<{
		id: string;
		kind: DragKind;
		dx: number;
	} | null>(null);

	function effective(): Project[] {
		const ov = overrides();
		if (Object.keys(ov).length === 0) return props.projects;
		return props.projects.map((p) =>
			p._id in ov
				? {
						...p,
						startDate: ov[p._id].startMs,
						endDate: ov[p._id].endMs,
					}
				: p
		);
	}

	const timeline = createMemo<Timeline | null>(() =>
		buildTimeline(
			effective(),
			props.mode,
			Date.now(),
			padBefore(),
			padAfter()
		)
	);

	function leaderName(bar: TimelineBar): string | undefined {
		return bar.leaderId
			? personName(bar.leaderId, props.people)
			: undefined;
	}
	function taskCount(bar: TimelineBar): number {
		return props.tasks.filter((t) => t.projectId === bar.id).length;
	}

	// Drop optimistic overrides once the real Convex data matches them.
	createEffect(() => {
		const ov = overrides();
		const projects = props.projects;
		const next = Object.fromEntries(
			Object.entries(ov).filter(([id, val]) => {
				const p = projects.find((x) => x._id === id);
				return !(
					p?.startDate === val.startMs && p.endDate === val.endMs
				);
			})
		);
		if (Object.keys(next).length !== Object.keys(ov).length)
			setOverrides(next);
	});

	// Reset padding + re-centre when the zoom changes.
	createEffect(
		on(
			() => props.mode,
			(m) => {
				setPadBefore(1);
				setPadAfter(DEFAULT_PAD[m]);
			},
			{ defer: true }
		)
	);

	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's ref={el} binding
	let scrollEl: HTMLDivElement | undefined;
	let growLeftFrom: number | null = null;

	function step(): number {
		return mode() === "month" ? 2 : 6;
	}

	function onScroll(): void {
		const el = scrollEl;
		if (!el) return;
		if (el.scrollLeft < EDGE) {
			growLeftFrom = el.scrollWidth;
			setPadBefore((p) => p + step());
		} else if (el.scrollWidth - el.scrollLeft - el.clientWidth < EDGE) {
			setPadAfter((p) => p + step());
		}
	}

	// Keep the viewport anchored when the range grows on the left.
	createEffect(() => {
		padBefore();
		if (scrollEl && growLeftFrom != null) {
			scrollEl.scrollLeft += scrollEl.scrollWidth - growLeftFrom;
			growLeftFrom = null;
		}
	});

	// Scroll the given day offset toward the left of the viewport.
	function scrollToOffset(offset: number, dayWidth: number): void {
		if (scrollEl)
			scrollEl.scrollLeft = Math.max(0, (offset - 2) * dayWidth);
	}

	// "Jump to today" from the toolbar (bumped nonce).
	createEffect(
		on(
			() => props.jumpToday(),
			() => {
				const t = timeline();
				if (t?.todayOffset != null)
					scrollToOffset(t.todayOffset, t.dayWidth);
			},
			{ defer: true }
		)
	);

	// Drag state held outside the signal so handlers can read the originals.
	let dragInfo: {
		id: string;
		kind: DragKind;
		startX: number;
		startMs: number;
		endMs: number;
	} | null = null;

	function barPointerDown(e: PointerEvent, bar: TimelineBar): void {
		const target = e.target as HTMLElement;
		const handle = target.dataset.handle;
		const kind: DragKind =
			handle === "start" ? "start" : handle === "end" ? "end" : "move";
		const root = e.currentTarget as HTMLElement;
		root.setPointerCapture(e.pointerId);
		dragInfo = {
			id: bar.id,
			kind,
			startX: e.clientX,
			startMs: bar.startMs,
			endMs: bar.endMs,
		};
		setDrag({ id: bar.id, kind, dx: 0 });
	}

	function barPointerMove(e: PointerEvent): void {
		if (dragInfo)
			setDrag({
				id: dragInfo.id,
				kind: dragInfo.kind,
				dx: e.clientX - dragInfo.startX,
			});
	}

	function barPointerUp(e: PointerEvent): void {
		const info = dragInfo;
		dragInfo = null;
		setDrag(null);
		if (!info) return;
		const dx = e.clientX - info.startX;
		const dayWidth = timeline()?.dayWidth ?? 1;
		// A near-stationary pointer is a click → open the drawer.
		if (Math.abs(dx) < CLICK_SLOP) {
			props.onSelect(info.id as Id<"projects">);
			return;
		}
		const deltaDays = Math.round(dx / dayWidth);
		if (deltaDays === 0) return;
		let s = info.startMs;
		let en = info.endMs;
		if (info.kind === "move") {
			s += deltaDays * DAY;
			en += deltaDays * DAY;
		} else if (info.kind === "start") {
			s = Math.min(info.startMs + deltaDays * DAY, info.endMs);
		} else {
			en = Math.max(info.endMs + deltaDays * DAY, info.startMs);
		}
		if (s === info.startMs && en === info.endMs) return;
		setOverrides((prev) => ({
			...prev,
			[info.id]: { startMs: s, endMs: en },
		}));
		void actions.update({
			id: info.id as Id<"projects">,
			startDate: s,
			endDate: en,
		});
	}

	function barLeft(bar: TimelineBar, t: Timeline): number {
		const dayWidth = t.dayWidth;
		const totalW = t.totalDays * dayWidth;
		const d = drag();
		const dx =
			d?.id === bar.id && (d.kind === "move" || d.kind === "start")
				? d.dx
				: 0;
		// Clamp into the canvas (a bar from out-of-window data sits at the edge).
		return Math.min(
			Math.max(bar.offset * dayWidth + dx, -dayWidth),
			totalW
		);
	}
	function barWidth(bar: TimelineBar, t: Timeline): number {
		const dayWidth = t.dayWidth;
		const totalW = t.totalDays * dayWidth;
		const d = drag();
		let w = bar.span * dayWidth;
		if (d?.id === bar.id) {
			if (d.kind === "start") w -= d.dx;
			else if (d.kind === "end") w += d.dx;
		}
		// Clamp to the canvas so a capped/huge span can't produce a giant element.
		return Math.max(Math.min(w, totalW), dayWidth);
	}

	// --- "New" row: drag across empty cells to create a project ---
	const [newRange, setNewRange] = createSignal<{
		a: number;
		b: number;
	} | null>(null);
	let newAnchor: number | null = null;

	function offsetFromEvent(e: PointerEvent): number {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const dayWidth = timeline()?.dayWidth ?? 1;
		return Math.max(0, Math.floor((e.clientX - rect.left) / dayWidth));
	}
	function newPointerDown(e: PointerEvent): void {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		newAnchor = offsetFromEvent(e);
		setNewRange({ a: newAnchor, b: newAnchor });
	}
	function newPointerMove(e: PointerEvent): void {
		if (newAnchor != null)
			setNewRange({ a: newAnchor, b: offsetFromEvent(e) });
	}
	function newPointerUp(e: PointerEvent): void {
		if (newAnchor == null) return;
		const a = newAnchor;
		const b = offsetFromEvent(e);
		newAnchor = null;
		setNewRange(null);
		const t = timeline();
		if (!t) return;
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		props.onCreateRange(
			t.rangeStartMs + lo * DAY,
			t.rangeStartMs + hi * DAY
		);
	}

	function isCurrentTick(t: Timeline, offset: number, span: number): boolean {
		return (
			t.todayOffset !== null &&
			t.todayOffset >= offset &&
			t.todayOffset < offset + span
		);
	}

	function colWidth(t: Timeline): number {
		if (mode() === "day") return t.dayWidth;
		if (mode() === "week") return t.dayWidth * 7;
		return t.totalDays * t.dayWidth; // month: no minor gridlines
	}

	return (
		<div class={styles.wrap}>
			<Show
				when={timeline()}
				fallback={
					<p class={styles.empty}>
						No projects with a start and end date yet.
					</p>
				}
			>
				{(t) => (
					<div
						class={styles.grid}
						style={{
							"--label-w": px(LABEL_WIDTH),
							"--row-h": px(ROW_HEIGHT),
							"--header-h": px(HEADER_HEIGHT),
							"--band-h": px(MONTH_BAND_HEIGHT),
							"--tick-h": px(TICK_ROW_HEIGHT),
						}}
					>
						<div class={styles.labels}>
							<div class={styles.labelHeader} />
							<For each={t().bars}>
								{(bar) => (
									<div class={styles.labelRow}>
										<ProjectCard
											name={bar.name}
											leaderName={leaderName(bar)}
											taskCount={taskCount(bar)}
											onClick={() => {
												props.onSelect(
													bar.id as Id<"projects">
												);
											}}
										/>
										<IconButton
											tooltipLabel="Jump to project"
											onClick={() => {
												scrollToOffset(
													bar.offset,
													t().dayWidth
												);
											}}
										>
											my_location
										</IconButton>
									</div>
								)}
							</For>
							<div class={styles.labelNew}>
								<Icon>{ICONS.add}</Icon> New
							</div>
						</div>

						<div
							class={styles.scroll}
							ref={scrollEl}
							onScroll={onScroll}
						>
							<div
								class={styles.canvas}
								style={{
									width: px(t().totalDays * t().dayWidth),
									"--day-w": px(t().dayWidth),
									"--col-w": px(colWidth(t())),
									"--weekend-tint":
										mode() === "day"
											? "var(--jf-surface-bg-sunken)"
											: "transparent",
								}}
							>
								<div class={styles.header}>
									<div class={styles.band}>
										<For each={t().months}>
											{(m) => (
												<div
													class={styles.bandCell}
													style={{
														left: px(
															m.offset *
																t().dayWidth
														),
														width: px(
															m.span *
																t().dayWidth
														),
													}}
												>
													<span>{m.label}</span>
												</div>
											)}
										</For>
									</div>
									<div class={styles.tickRow}>
										<For each={t().ticks}>
											{(tk) => (
												<div
													classList={{
														[styles.tickCell]: true,
														[styles.weekendTick]:
															tk.weekend === true,
														[styles.currentTick]:
															isCurrentTick(
																t(),
																tk.offset,
																tk.span
															),
													}}
													style={{
														left: px(
															tk.offset *
																t().dayWidth
														),
														width: px(
															tk.span *
																t().dayWidth
														),
													}}
												>
													<span>{tk.label}</span>
												</div>
											)}
										</For>
									</div>
								</div>

								<div class={styles.body}>
									<div class={styles.lines} />
									<For each={t().months}>
										{(m) => (
											<Show when={m.offset > 0}>
												<div
													class={styles.monthLine}
													style={{
														left: px(
															m.offset *
																t().dayWidth
														),
													}}
												/>
											</Show>
										)}
									</For>
									<Show when={t().todayOffset !== null}>
										<div
											class={styles.today}
											style={{
												left: px(
													(t().todayOffset ?? 0) *
														t().dayWidth
												),
											}}
										/>
									</Show>
									<For each={t().bars}>
										{(bar) => (
											<div class={styles.row}>
												<div
													class={styles.bar}
													style={{
														left: px(
															barLeft(bar, t())
														),
														width: px(
															barWidth(bar, t())
														),
													}}
													title={bar.name}
													onPointerDown={(e) => {
														barPointerDown(e, bar);
													}}
													onPointerMove={
														barPointerMove
													}
													onPointerUp={barPointerUp}
												>
													<span
														class={styles.handle}
														data-handle="start"
													/>
													<span
														class={styles.barLabel}
													>
														{bar.name}
													</span>
													<span
														class={styles.handle}
														data-handle="end"
													/>
												</div>
											</div>
										)}
									</For>
									<div
										class={styles.newRow}
										onPointerDown={newPointerDown}
										onPointerMove={newPointerMove}
										onPointerUp={newPointerUp}
									>
										<Show when={newRange()}>
											{(r) => (
												<div
													class={styles.newPreview}
													style={{
														left: px(
															Math.min(
																r().a,
																r().b
															) * t().dayWidth
														),
														width: px(
															(Math.abs(
																r().a - r().b
															) +
																1) *
																t().dayWidth
														),
													}}
												/>
											)}
										</Show>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}
			</Show>
		</div>
	);
}
