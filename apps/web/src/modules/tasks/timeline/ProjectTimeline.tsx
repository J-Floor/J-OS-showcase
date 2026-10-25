import { Query } from "@j-os/design-system";
import { createMemo, Show, type JSX } from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { personName } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";

import styles from "./ProjectTimeline.module.scss";
import {
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

/** What the timeline lets its parent do: the toolbar's "Today" button
 *  recentres it. */
export type ProjectTimelineApi = { scrollToToday: () => void };

type ProjectTimelineProps = {
	/** Receives the timeline's imperative API once, when it is created. */
	ref?: (api: ProjectTimelineApi) => void;
	projects: Project[] | undefined;
	people: Person[];
	tasks: Task[] | undefined;
	mode: ViewMode;
	onSelect: (id: Id<"projects">) => void;
	/** The pointer rested on a project: its sheet is about to open. */
	onHoverIntent?: () => void;
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
	// eslint-disable-next-line solid/reactivity -- a ref callback is called once, at setup
	props.ref?.({ scrollToToday: scroll.scrollToToday });

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
								<div class={styles.grid}>
									<TimelineLabels
										timeline={current}
										leaderName={leaderName}
										taskCount={taskCount}
										onSelect={props.onSelect}
										onHoverIntent={props.onHoverIntent}
										scrollToOffset={scroll.scrollToOffset}
									/>

									<div
										class={styles.scroll}
										data-part="timeline-scroll"
										ref={scroll.setScrollElement}
										onScroll={scroll.onScroll}
									>
										<div
											class={styles.canvas}
											data-mode={mode()}
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
