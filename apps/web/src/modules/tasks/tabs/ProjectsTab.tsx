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
import type { Project } from "../data/tasksData.tsx";
import { useProjects, useTasks } from "../data/tasksData.tsx";
import { ProjectDrawer } from "../drawers/ProjectDrawer.tsx";
import { TaskDrawer } from "../drawers/TaskDrawer.tsx";
import { ProjectCard } from "../ProjectCard.tsx";
import { ProjectTimeline } from "../timeline/ProjectTimeline.tsx";
import { undatedProjects, type ViewMode } from "../timeline/timeline.ts";

import local from "./ProjectsTab.module.scss";
import styles from "./TabShared.module.scss";

export function ProjectsTab(props: {
	requestNew: () => number;
	mode: Accessor<ViewMode>;
	jumpToday: Accessor<number>;
	/** Whether the Projects tab is the one on screen — gates the `?project=`
	 *  read/write side of the entity selection below. */
	active: () => boolean;
	/** An inbound `?project=` arrived while another tab was showing; switch to
	 *  this tab so the selection below can open it. */
	onNeedTab: (slug: string) => void;
}): JSX.Element {
	const projects = useProjects();
	const boardLevel = useBoardLevel();
	const tasks = useTasks();

	// Bidirectional deep-linking: opening a project writes `?project=<id>`; an
	// inbound `?project=<id>` opens it (switching to this tab first via
	// `onNeedTab` if needed); closing clears the param.
	const projSel = createEntitySelection<Project>({
		rows: projects.data,
		param: "project",
		active: () => props.active(),
		onNeedTab: (slug) => {
			props.onNeedTab(slug);
		},
	});

	const [createStart, setCreateStart] = createSignal<number | undefined>();
	const [createEnd, setCreateEnd] = createSignal<number | undefined>();
	// A task opened from inside a project's drawer — a nested view, not the
	// tab's own URL-linked selection (that stays on the Tasks tab's `?task=`).
	const [taskOpen, setTaskOpen] = createSignal(false);
	const [editingTaskId, setEditingTaskId] = createSignal<Id<"tasks">>();

	// Leaving this tab abandons whatever it had open — see the matching effect
	// in TasksTab for why this (not the selection's own `close`) is what clears
	// the local open/selected state when the page switches away. Also closes
	// the nested task-from-a-project drawer above, local state outside the
	// selection entirely.
	createEffect(
		on(
			() => props.active(),
			(active) => {
				if (!active) {
					projSel.close(false);
					setTaskOpen(false);
				}
			},
			{ defer: true }
		)
	);

	function all() {
		return projects.data() ?? [];
	}
	function undated() {
		return undatedProjects(all());
	}
	function leaderName(p: Project) {
		return p.leaderId
			? personName(p.leaderId, boardLevel.data() ?? [])
			: undefined;
	}
	function taskCount(p: Project) {
		return (tasks.data() ?? []).filter((t) => t.projectId === p._id).length;
	}
	function editingTask() {
		const id = editingTaskId();
		return id ? (tasks.data() ?? []).find((t) => t._id === id) : undefined;
	}

	// The timeline hands back an id, not a row (it doesn't hold row objects).
	function openProject(id: Id<"projects">) {
		const p = all().find((proj) => proj._id === id);
		if (p) projSel.openRow(p);
	}
	function openNew() {
		setCreateStart(undefined);
		setCreateEnd(undefined);
		projSel.openCreate();
	}
	// Drag across the timeline's "New" row → create a project over that range.
	function openNewRange(startMs: number, endMs: number) {
		setCreateStart(startMs);
		setCreateEnd(endMs);
		projSel.openCreate();
	}

	const projNav = createDrawerNav({
		items: all,
		currentId: projSel.selectedId,
		onSelect: (p) => {
			projSel.openRow(p);
		},
	});

	// Open the create drawer when the tab-bar "+ Project" button fires.
	createEffect(on(() => props.requestNew(), openNew, { defer: true }));

	return (
		<div class={styles.tab}>
			<ProjectTimeline
				projects={all()}
				people={boardLevel.data() ?? []}
				tasks={tasks.data() ?? []}
				mode={props.mode()}
				jumpToday={props.jumpToday}
				onSelect={openProject}
				onCreateRange={openNewRange}
			/>
			<Show when={undated().length}>
				<section class={local.undated}>
					<h4>No dates set</h4>
					<ul>
						<For each={undated()}>
							{(p) => (
								<li class={local.undatedItem}>
									<ProjectCard
										name={p.name}
										leaderName={leaderName(p)}
										taskCount={taskCount(p)}
										onClick={() => {
											projSel.openRow(p);
										}}
									/>
								</li>
							)}
						</For>
					</ul>
				</section>
			</Show>
			<ProjectDrawer
				open={projSel.open()}
				onOpenChange={(v) => {
					if (!v) projSel.close();
				}}
				project={projSel.selected()}
				loading={projSel.loading()}
				initialStart={createStart()}
				initialEnd={createEnd()}
				people={boardLevel.data() ?? []}
				projects={all()}
				tasks={tasks.data() ?? []}
				onTaskClick={(t) => {
					// Transitioning to the nested task drawer, not returning to
					// the list — clear in place, don't pop history.
					projSel.close(false);
					setEditingTaskId(t._id);
					setTaskOpen(true);
				}}
				nav={{
					hasPrev: projNav.hasPrev,
					hasNext: projNav.hasNext,
					onPrev: projNav.prev,
					onNext: projNav.next,
				}}
			/>
			<TaskDrawer
				open={taskOpen()}
				onOpenChange={setTaskOpen}
				task={editingTask()}
				people={boardLevel.data() ?? []}
				projects={all()}
			/>
		</div>
	);
}
