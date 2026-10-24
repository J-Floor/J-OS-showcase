import { Query } from "@j-os/design-system";
import { createMemo, Show, type Accessor, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { personName } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";

import styles from "./ProjectTimeline.module.scss";
import {
	HEADER_HEIGHT,
	MONTH_BAND_HEIGHT,
	ROW_HEIGHT,
	TICK_ROW_HEIGHT,
	buildTimeline,
	type Timeline,
	type TimelineBar,
	type ViewMode,
} from "./timeline.ts";
import {
	TimelineBody,
	TimelineHeader,
	TimelineLabels,
	columnWidth,
	px,
} from "./TimelineGrid.tsx";
import {
	createBarDrag,
	createNewRangeDrag,
	createProjectOverrides,
	createTimelinePadding,
	createTimelineScroll,
} from "./timelineInteraction.ts";

const LABEL_WIDTH = 248;

type ProjectTimelineProps = {
	projects: Project[] | undefined;
	people: Person[];
	tasks: Task[] | undefined;
	mode: ViewMode;
	/** Bumped by the toolbar "Today" button to recentre on today. */
	jumpToday: Accessor<number>;
	onSelect: (id: Id<"projects">) => void;
	/** Drag across the "New" row to create a project with that date range,
	 *  out of `from` (the dragged range). */
	onCreateRange: (
		startMs: number,
		endMs: number,
		from: HTMLElement | null
	) => void;
};

/** The laid-out timeline, each bar's label details, and what scrolling and
 *  dragging do to it. */
function createTimelineModel(props: ProjectTimelineProps) {
	function mode(): ViewMode {
		return props.mode;
	}

	const padding = createTimelinePadding({ mode });
	const projectOverrides = createProjectOverrides({
		projects: () => props.projects,
	});

	const timeline = createMemo<Timeline | null>(() =>
		buildTimeline(
			projectOverrides.effective() ?? [],
			props.mode,
			Date.now(),
			{
				before: padding.padBefore(),
				after: padding.padAfter(),
			}
		)
	);

	function leaderName(bar: TimelineBar): string | undefined {
		return bar.leaderId
			? personName(bar.leaderId, props.people)
			: undefined;
	}
	/** The bar's task count; `undefined` while the tasks load. */
	function taskCount(bar: TimelineBar): number | undefined {
		return props.tasks?.filter((task) => task.projectId === bar.id).length;
	}

	return {
		mode,
		timeline,
		leaderName,
		taskCount,
		scroll: createTimelineScroll({
			mode,
			padding,
			timeline,
			jumpToday: () => props.jumpToday(),
		}),
		barDrag: createBarDrag({
			timeline,
			setOverrides: projectOverrides.setOverrides,
			onSelect: (id) => {
				props.onSelect(id);
			},
		}),
		newDrag: createNewRangeDrag({
			timeline,
			onCreateRange: (startMs, endMs, from) => {
				props.onCreateRange(startMs, endMs, from);
			},
		}),
	};
}

export function ProjectTimeline(props: ProjectTimelineProps): JSX.Element {
	const { mode, timeline, scroll, barDrag, newDrag, leaderName, taskCount } =
		createTimelineModel(props);

	return (
		<div class={styles.wrap}>
			<Query.Root data={props.projects}>
				<Query.Content of={props.projects}>
					{() => (
						<Show
							when={timeline()}
							fallback={
								<p class={styles.empty}>
									No projects with a start and end date yet.
								</p>
							}
						>
							{(current) => (
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
									<TimelineLabels
										timeline={current}
										leaderName={leaderName}
										taskCount={taskCount}
										onSelect={props.onSelect}
										scrollToOffset={scroll.scrollToOffset}
									/>

									<div
										class={styles.scroll}
										ref={scroll.setScrollElement}
										onScroll={scroll.onScroll}
									>
										<div
											class={styles.canvas}
											style={{
												"--canvas-w": px(
													current().totalDays *
														current().dayWidth
												),
												"--day-w": px(
													current().dayWidth
												),
												"--col-w": px(
													columnWidth(
														current(),
														mode()
													)
												),
												"--weekend-tint":
													mode() === "day"
														? "var(--jf-surface-bg-sunken)"
														: "transparent",
											}}
										>
											<TimelineHeader
												timeline={current}
											/>
											<TimelineBody
												timeline={current}
												barDrag={barDrag}
												newDrag={newDrag}
											/>
										</div>
									</div>
								</div>
							)}
						</Show>
					)}
				</Query.Content>
			</Query.Root>
		</div>
	);
}
