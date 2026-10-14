import { Icon, IconButton } from "@j-os/design-system";
import { For, Show, type Accessor } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { DAYS_PER_WEEK } from "../../../../convex/lib/constants.ts";
import { ICONS } from "../../../shared/icons.ts";
import { ProjectCard } from "../ProjectCard.tsx";

import styles from "./ProjectTimeline.module.scss";
import type { Timeline, TimelineBar, ViewMode } from "./timeline.ts";
import type {
	createBarDrag,
	createNewRangeDrag,
} from "./timelineInteraction.ts";

export function px(value: number): string {
	return `${String(value)}px`;
}

type TimelineProps = { timeline: Accessor<Timeline> };

/** The left column: a card per project (with a "jump to project" button), and
 *  the "New" row's label. */
export function TimelineLabels(
	props: TimelineProps & {
		leaderName: (bar: TimelineBar) => string | undefined;
		taskCount: (bar: TimelineBar) => number | undefined;
		onSelect: (id: Id<"projects">) => void;
		scrollToOffset: (offset: number, dayWidth: number) => void;
	}
) {
	return (
		<div class={styles.labels}>
			<div class={styles.labelHeader} />
			<For each={props.timeline().bars}>
				{(bar) => (
					<div class={styles.labelRow}>
						<ProjectCard
							name={bar.name}
							leaderName={props.leaderName(bar)}
							taskCount={props.taskCount(bar)}
							onClick={() => {
								props.onSelect(bar.id);
							}}
						/>
						<IconButton
							tooltipLabel="Jump to project"
							onClick={() => {
								props.scrollToOffset(
									bar.offset,
									props.timeline().dayWidth
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
	);
}

function isCurrentTick(
	timeline: Timeline,
	offset: number,
	span: number
): boolean {
	return (
		timeline.todayOffset !== null &&
		timeline.todayOffset >= offset &&
		timeline.todayOffset < offset + span
	);
}

/** The month band and the day/week tick row above the bars. */
export function TimelineHeader(props: TimelineProps) {
	function timeline() {
		return props.timeline();
	}
	return (
		<div class={styles.header}>
			<div class={styles.band}>
				<For each={timeline().months}>
					{(month) => (
						<div
							class={styles.bandCell}
							style={{
								left: px(month.offset * timeline().dayWidth),
								width: px(month.span * timeline().dayWidth),
							}}
						>
							<span>{month.label}</span>
						</div>
					)}
				</For>
			</div>
			<div class={styles.tickRow}>
				<For each={timeline().ticks}>
					{(tk) => (
						<div
							classList={{
								[styles.tickCell]: true,
								[styles.weekendTick]: tk.weekend === true,
								[styles.currentTick]: isCurrentTick(
									timeline(),
									tk.offset,
									tk.span
								),
							}}
							style={{
								left: px(tk.offset * timeline().dayWidth),
								width: px(tk.span * timeline().dayWidth),
							}}
						>
							<span>{tk.label}</span>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

/** The gridlines: month boundaries and the today marker. */
function TimelineGridLines(props: TimelineProps) {
	function timeline() {
		return props.timeline();
	}
	return (
		<>
			<div class={styles.lines} />
			<For each={timeline().months}>
				{(month) => (
					<Show when={month.offset > 0}>
						<div
							class={styles.monthLine}
							style={{
								left: px(month.offset * timeline().dayWidth),
							}}
						/>
					</Show>
				)}
			</For>
			<Show when={timeline().todayOffset !== null}>
				<div
					class={styles.today}
					style={{
						left: px(
							(timeline().todayOffset ?? 0) * timeline().dayWidth
						),
					}}
				/>
			</Show>
		</>
	);
}

/** The bars area: gridlines, a draggable bar per project, and the "New"
 *  row you drag across to create a project. */
export function TimelineBody(
	props: TimelineProps & {
		barDrag: ReturnType<typeof createBarDrag>;
		newDrag: ReturnType<typeof createNewRangeDrag>;
	}
) {
	function timeline() {
		return props.timeline();
	}
	return (
		<div class={styles.body}>
			<TimelineGridLines timeline={props.timeline} />
			<For each={timeline().bars}>
				{(bar) => (
					<div class={styles.row}>
						<div
							class={styles.bar}
							style={{
								left: px(
									props.barDrag.barLeft(bar, timeline())
								),
								width: px(
									props.barDrag.barWidth(bar, timeline())
								),
							}}
							title={bar.name}
							onPointerDown={(event) => {
								props.barDrag.barPointerDown(event, bar);
							}}
							onPointerMove={props.barDrag.barPointerMove}
							onPointerUp={props.barDrag.barPointerUp}
						>
							<span class={styles.handle} data-handle="start" />
							<span class={styles.barLabel}>{bar.name}</span>
							<span class={styles.handle} data-handle="end" />
						</div>
					</div>
				)}
			</For>
			<div
				class={styles.newRow}
				onPointerDown={(event) => {
					props.newDrag.newPointerDown(event);
				}}
				onPointerMove={(event) => {
					props.newDrag.newPointerMove(event);
				}}
				onPointerUp={(event) => {
					props.newDrag.newPointerUp(event);
				}}
			>
				<Show when={props.newDrag.newRange()}>
					{(range) => (
						<div
							class={styles.newPreview}
							style={{
								left: px(
									Math.min(range().a, range().b) *
										timeline().dayWidth
								),
								width: px(
									(Math.abs(range().a - range().b) + 1) *
										timeline().dayWidth
								),
							}}
						/>
					)}
				</Show>
			</div>
		</div>
	);
}

/** Width of a minor gridline column: a day, a week, or (month mode, which
 *  has none) the whole canvas. */
export function columnWidth(timeline: Timeline, mode: ViewMode): number {
	if (mode === "month") return timeline.totalDays * timeline.dayWidth;
	return mode === "day"
		? timeline.dayWidth
		: timeline.dayWidth * DAYS_PER_WEEK;
}
