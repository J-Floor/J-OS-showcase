import { Tabs } from "@j-os/design-system";
import {
	For,
	Show,
	createEffect,
	createSignal,
	on,
	type Accessor,
	type JSX,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { createSheetNav } from "../../../lib/createSheetNav.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { personName } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useProjects, useTasks } from "../data/tasksData.tsx";
import { ProjectCard } from "../ProjectCard.tsx";
import { ProjectSheet } from "../sheets/ProjectSheet.tsx";
import { TaskSheet } from "../sheets/TaskSheet.tsx";
import { ProjectTabActions } from "../TasksTabActions.tsx";
import {
	ProjectTimeline,
	type ProjectTimelineApi,
} from "../timeline/ProjectTimeline.tsx";
import { undatedProjects, type ViewMode } from "../timeline/timeline.ts";

import local from "./ProjectsTab.module.scss";
import styles from "./TabShared.module.scss";

type ProjectsTabProps = {
	/** Whether the Projects tab is the one on screen — gates the `?project=`
	 *  read/write side of the entity selection below. */
	active: () => boolean;
	/** An inbound `?project=` arrived while another tab was showing; switch to
	 *  this tab so the selection below can open it. */
	onNeedTab: (slug: string) => void;
};

/** The date range a create sheet opens with, and what it opens out of when
 *  nothing was clicked (a range dragged on the timeline). */
function createRangeDraft() {
	const [start, setStart] = createSignal<number | undefined>();
	const [end, setEnd] = createSignal<number | undefined>();
	const [from, setFrom] = createSignal<HTMLElement | null>(null);
	return {
		start,
		end,
		from,
		set(
			startMs: number | undefined,
			endMs: number | undefined,
			source: HTMLElement | null
		): void {
			setStart(startMs);
			setEnd(endMs);
			setFrom(source);
		},
	};
}

/**
 * The project sheet's selection, with deep-linking: opening a project writes
 * `?project=<id>`; an inbound `?project=<id>` opens it (switching to this tab
 * first via `onNeedTab` if needed); closing clears the param. Also the date
 * range a create sheet opens with, and `onLeave` for what to drop when the
 * tab stops being the one on screen.
 */
function createProjectSelection(options: {
	props: ProjectsTabProps;
	rows: Accessor<Project[] | undefined>;
	onLeave: () => void;
}) {
	const { props } = options;
	function all(): Project[] {
		return options.rows() ?? [];
	}
	const projSel = createEntitySelection<Project>({
		rows: options.rows,
		param: "project",
		active: () => props.active(),
		onNeedTab: (slug) => {
			props.onNeedTab(slug);
		},
	});
	const draft = createRangeDraft();

	// Leaving this tab abandons whatever it had open — see the matching effect
	// in TasksTab for why this (not the selection's own `close`) is what clears
	// the local open/selected state when the page switches away.
	createEffect(
		on(
			() => props.active(),
			(active) => {
				if (active) {
					return;
				}

				projSel.close(false);
				options.onLeave();
			},
			{ defer: true }
		)
	);

	const projNav = createSheetNav({
		items: all,
		currentId: projSel.requestedId,
		onSelect: (project) => {
			projSel.openRow(project);
		},
	});

	function openNewWithRange(
		startMs?: number,
		endMs?: number,
		from: HTMLElement | null = null
	) {
		draft.set(startMs, endMs, from);
		projSel.openCreate();
	}

	return {
		projSel,
		sheetNav: projNav,
		createStart: draft.start,
		createEnd: draft.end,
		createFrom: draft.from,
		openNew: (): void => {
			openNewWithRange();
		},
		// The timeline hands back an id, not a row (it doesn't hold row objects).
		openProject: (id: Id<"projects">): void => {
			const project = all().find((proj) => proj._id === id);
			if (project) projSel.openRow(project);
		},
		// Drag across the timeline's "New" row → create a project over that range.
		openNewRange: (
			startMs: number,
			endMs: number,
			from: HTMLElement | null
		): void => {
			openNewWithRange(startMs, endMs, from);
		},
	};
}

/** The projects with no (or an inverted) date range, which the timeline can't
 *  draw. */
function UndatedProjects(props: {
	projects: Project[];
	leaderName: (p: Project) => string | undefined;
	taskCount: (p: Project) => number | undefined;
	onOpen: (p: Project) => void;
	onHoverIntent: () => void;
}) {
	return (
		<section class={local.undated}>
			<h4>No dates set</h4>
			<ul>
				<For each={props.projects}>
					{(project) => (
						<li>
							<ProjectCard
								isBoxed
								id={project._id}
								name={project.name}
								leaderName={props.leaderName(project)}
								taskCount={props.taskCount(project)}
								onClick={() => {
									props.onOpen(project);
								}}
								onHoverIntent={props.onHoverIntent}
							/>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}

/** A task opened from inside a project's sheet — a nested view, not the
 *  tab's own URL-linked selection (that stays on the Tasks tab's `?task=`). */
function createNestedTask(options: { tasks: Accessor<Task[] | undefined> }) {
	const [taskOpen, setTaskOpen] = createSignal(false);
	const [editingTaskId, setEditingTaskId] = createSignal<Id<"tasks">>();
	return {
		taskOpen,
		setTaskOpen,
		editingTask() {
			const id = editingTaskId();
			return id
				? (options.tasks() ?? []).find((task) => task._id === id)
				: undefined;
		},
		open: (task: Task): void => {
			setEditingTaskId(task._id);
			setTaskOpen(true);
		},
	};
}

/** The timeline and its tab-bar controls: the day/week/month view and "Today"
 *  live here, beside the timeline they drive; "New project" opens the tab's
 *  create sheet. */
function TimelineView(props: {
	projects: Project[] | undefined;
	people: Person[];
	tasks: Task[] | undefined;
	onSelect: (id: Id<"projects">) => void;
	onHoverIntent: () => void;
	onCreateRange: (
		startMs: number,
		endMs: number,
		from: HTMLElement | null
	) => void;
	onNewProject: () => void;
}): JSX.Element {
	const [mode, setMode] = createSignal<ViewMode>("day");
	let timelineApi: ProjectTimelineApi | undefined;
	return (
		<>
			<Tabs.Actions value="projects">
				<ProjectTabActions
					mode={mode}
					onModeChange={setMode}
					onJumpToday={() => {
						timelineApi?.scrollToToday();
					}}
					onNewProject={props.onNewProject}
				/>
			</Tabs.Actions>
			<ProjectTimeline
				ref={(api) => {
					timelineApi = api;
				}}
				projects={props.projects}
				people={props.people}
				tasks={props.tasks}
				mode={mode()}
				onSelect={props.onSelect}
				onHoverIntent={props.onHoverIntent}
				onCreateRange={props.onCreateRange}
			/>
		</>
	);
}

/** What a project's card shows beside its name: its leader and task count. */
function createProjectLookups(options: {
	people: Accessor<Person[]>;
	tasks: Accessor<Task[] | undefined>;
}) {
	return {
		leaderName: (project: Project): string | undefined =>
			project.leaderId
				? personName(project.leaderId, options.people())
				: undefined,
		taskCount: (project: Project): number | undefined =>
			options.tasks()?.filter((task) => task.projectId === project._id)
				.length,
	};
}

export function ProjectsTab(props: ProjectsTabProps): JSX.Element {
	const projects = useProjects();
	const boardLevel = useBoardLevel();
	const tasks = useTasks();

	const nestedTask = createNestedTask({ tasks: tasks.data });

	function all() {
		return projects.data() ?? [];
	}
	const selection = createProjectSelection({
		props,
		rows: projects.data,
		// Also closes the nested task-from-a-project sheet, local state
		// outside the selection entirely.
		onLeave: () => {
			nestedTask.setTaskOpen(false);
		},
	});
	const { projSel } = selection;
	const { leaderName, taskCount } = createProjectLookups({
		people: () => boardLevel.data() ?? [],
		tasks: tasks.data,
	});

	function undated() {
		return undatedProjects(all());
	}

	return (
		<div class={styles.tab}>
			<TimelineView
				projects={projects.data()}
				people={boardLevel.data() ?? []}
				tasks={tasks.data()}
				onSelect={selection.openProject}
				onHoverIntent={projSel.intend}
				onCreateRange={selection.openNewRange}
				onNewProject={selection.openNew}
			/>
			{/* While projects load, the timeline shows the skeleton. */}
			<Show when={undated().length}>
				<UndatedProjects
					projects={undated()}
					leaderName={leaderName}
					taskCount={taskCount}
					onOpen={(project) => {
						projSel.openRow(project);
					}}
					onHoverIntent={projSel.intend}
				/>
			</Show>
			<ProjectSheet
				open={projSel.open()}
				prebuild={projSel.prebuild()}
				onOpenChange={(isOpen) => {
					if (!isOpen) projSel.close();
				}}
				project={projSel.selected()}
				loading={projSel.loading()}
				initialStart={selection.createStart()}
				initialEnd={selection.createEnd()}
				morphFrom={selection.createFrom}
				onTaskClick={(task) => {
					// Transitioning to the nested task sheet, not returning to
					// the list — clear in place, don't pop history.
					projSel.close(false);
					nestedTask.open(task);
				}}
				nav={selection.sheetNav}
			/>
			<TaskSheet
				open={nestedTask.taskOpen()}
				onOpenChange={nestedTask.setTaskOpen}
				task={nestedTask.editingTask()}
			/>
		</div>
	);
}
