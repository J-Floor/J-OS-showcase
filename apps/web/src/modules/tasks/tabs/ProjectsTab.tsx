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
import { createDrawerNav } from "../../../lib/createDrawerNav.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { personName } from "../data/taskHelpers.ts";
import type { Project, Task } from "../data/tasksData.tsx";
import { useProjects, useTasks } from "../data/tasksData.tsx";
import { ProjectDrawer } from "../drawers/ProjectDrawer.tsx";
import { TaskDrawer } from "../drawers/TaskDrawer.tsx";
import { ProjectCard } from "../ProjectCard.tsx";
import { ProjectTimeline } from "../timeline/ProjectTimeline.tsx";
import { undatedProjects, type ViewMode } from "../timeline/timeline.ts";

import local from "./ProjectsTab.module.scss";
import styles from "./TabShared.module.scss";

type ProjectsTabProps = {
	requestNew: () => number;
	mode: Accessor<ViewMode>;
	jumpToday: Accessor<number>;
	/** Whether the Projects tab is the one on screen — gates the `?project=`
	 *  read/write side of the entity selection below. */
	active: () => boolean;
	/** An inbound `?project=` arrived while another tab was showing; switch to
	 *  this tab so the selection below can open it. */
	onNeedTab: (slug: string) => void;
};

/**
 * The project drawer's selection, with deep-linking: opening a project writes
 * `?project=<id>`; an inbound `?project=<id>` opens it (switching to this tab
 * first via `onNeedTab` if needed); closing clears the param. Also the date
 * range a create drawer opens with, and `onLeave` for what to drop when the
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
	const [createStart, setCreateStart] = createSignal<number | undefined>();
	const [createEnd, setCreateEnd] = createSignal<number | undefined>();

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

	const projNav = createDrawerNav({
		items: all,
		currentId: projSel.selectedId,
		onSelect: (project) => {
			projSel.openRow(project);
		},
	});

	function openNewWithRange(startMs?: number, endMs?: number) {
		setCreateStart(startMs);
		setCreateEnd(endMs);
		projSel.openCreate();
	}

	// Open the create drawer when the tab-bar "+ Project" button fires.
	createEffect(
		on(
			() => props.requestNew(),
			() => {
				openNewWithRange();
			},
			{ defer: true }
		)
	);

	return {
		projSel,
		drawerNav: {
			hasPrev: projNav.hasPrev,
			hasNext: projNav.hasNext,
			onPrev: projNav.prev,
			onNext: projNav.next,
		},
		createStart,
		createEnd,
		// The timeline hands back an id, not a row (it doesn't hold row objects).
		openProject: (id: Id<"projects">): void => {
			const project = all().find((proj) => proj._id === id);
			if (project) projSel.openRow(project);
		},
		// Drag across the timeline's "New" row → create a project over that range.
		openNewRange: (startMs: number, endMs: number): void => {
			openNewWithRange(startMs, endMs);
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
}) {
	return (
		<section class={local.undated}>
			<h4>No dates set</h4>
			<ul>
				<For each={props.projects}>
					{(project) => (
						<li class={local.undatedItem}>
							<ProjectCard
								name={project.name}
								leaderName={props.leaderName(project)}
								taskCount={props.taskCount(project)}
								onClick={() => {
									props.onOpen(project);
								}}
							/>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}

/** A task opened from inside a project's drawer — a nested view, not the
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
		// Also closes the nested task-from-a-project drawer, local state
		// outside the selection entirely.
		onLeave: () => {
			nestedTask.setTaskOpen(false);
		},
	});
	const { projSel } = selection;

	function undated() {
		return undatedProjects(all());
	}
	function leaderName(project: Project) {
		return project.leaderId
			? personName(project.leaderId, boardLevel.data() ?? [])
			: undefined;
	}
	function taskCount(project: Project) {
		return tasks.data()?.filter((task) => task.projectId === project._id)
			.length;
	}

	return (
		<div class={styles.tab}>
			<ProjectTimeline
				projects={projects.data()}
				people={boardLevel.data() ?? []}
				tasks={tasks.data()}
				mode={props.mode()}
				jumpToday={props.jumpToday}
				onSelect={selection.openProject}
				onCreateRange={selection.openNewRange}
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
				/>
			</Show>
			<ProjectDrawer
				open={projSel.open()}
				onOpenChange={(isOpen) => {
					if (!isOpen) projSel.close();
				}}
				project={projSel.selected()}
				loading={projSel.loading()}
				initialStart={selection.createStart()}
				initialEnd={selection.createEnd()}
				people={boardLevel.data() ?? []}
				projects={all()}
				tasks={tasks.data()}
				onTaskClick={(task) => {
					// Transitioning to the nested task drawer, not returning to
					// the list — clear in place, don't pop history.
					projSel.close(false);
					nestedTask.open(task);
				}}
				nav={selection.drawerNav}
			/>
			<TaskDrawer
				open={nestedTask.taskOpen()}
				onOpenChange={nestedTask.setTaskOpen}
				task={nestedTask.editingTask()}
				people={boardLevel.data() ?? []}
				projects={all()}
			/>
		</div>
	);
}
