import { Tabs } from "@j-os/design-system";
import { createEffect, createSignal, on, type JSX } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { displayName } from "../../../../convex/lib/names.ts";
import { createSheetNav } from "../../../lib/createSheetNav.ts";
import { createPersistedSignal } from "../../../lib/persistedSignal.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import {
	ASSIGNEE_FILTER_ALL,
	ASSIGNEE_FILTER_ME,
	filterTasksByAssignee,
} from "../data/taskHelpers.ts";
import { useCurrentPerson, useProjects, useTasks } from "../data/tasksData.tsx";
import { KanbanBoard } from "../kanban/KanbanBoard.tsx";
import type { TaskStatus } from "../kanban/onDrop.ts";
import { TaskSheet } from "../sheets/TaskSheet.tsx";
import { TasksTabActions } from "../TasksTabActions.tsx";

import styles from "./TabShared.module.scss";

/** Assignee filter for the Tasks board. "Me" leads; "Everyone" (the default)
 *  clears it. Self is dropped from the per-person list since "Me" covers it.
 *  Persisted across reloads so the board keeps a chosen "Me"/person filter. */
function createAssigneeFilter() {
	const boardLevel = useBoardLevel();
	const currentPerson = useCurrentPerson();
	const [assignee, setAssignee] = createPersistedSignal(
		"tasks.assigneeFilter",
		ASSIGNEE_FILTER_ALL
	);
	return {
		assignee,
		setAssignee,
		assigneeOptions: () => {
			const meId = currentPerson.data()?._id;
			return [
				{ value: ASSIGNEE_FILTER_ME, label: "Me" },
				{ value: ASSIGNEE_FILTER_ALL, label: "Everyone" },
				...(boardLevel.data() ?? [])
					.filter((person) => person._id !== meId)
					.map((person) => ({
						value: person._id,
						label: displayName(person),
					})),
			];
		},
	};
}

/** The tasks, and those shown on the board, narrowed by the assignee filter.
 *  Drives the kanban and the sheet's prev/next nav so navigation stays within
 *  the visible set; the edited task itself still resolves from the full
 *  list. */
function useVisibleTasks(options: { assigneeFilter: () => string }) {
	const tasks = useTasks();
	const currentPerson = useCurrentPerson();
	return {
		tasks,
		/** Tasks shown on the board, narrowed by the assignee filter;
		 *  `undefined` while the tasks load. */
		visibleTasks: () => {
			const all = tasks.data();
			return (
				all &&
				filterTasksByAssignee(
					all,
					options.assigneeFilter(),
					currentPerson.data()?._id
				)
			);
		},
	};
}

export function TasksTab(props: {
	/** Whether the Tasks tab is the one on screen — gates the `?task=`
	 *  read/write side of the entity selection below. */
	active: () => boolean;
	/** An inbound `?task=` arrived while another tab was showing; switch to
	 *  this tab so the selection below can open it. */
	onNeedTab: (slug: string) => void;
}): JSX.Element {
	const boardLevel = useBoardLevel();
	const projects = useProjects();
	const { assignee, setAssignee, assigneeOptions } = createAssigneeFilter();
	const { tasks, visibleTasks } = useVisibleTasks({
		assigneeFilter: assignee,
	});

	// Bidirectional deep-linking: opening a task writes `?task=<id>`; an
	// inbound `?task=<id>` opens it (switching to this tab first via
	// `onNeedTab` if needed); closing clears the param.
	const selection = createEntitySelection<Doc<"tasks">>({
		rows: tasks.data,
		param: "task",
		active: () => props.active(),
		onNeedTab: (slug) => {
			props.onNeedTab(slug);
		},
	});
	const { selected, requestedId, open, loading, openRow, openCreate, close } =
		selection;

	// Leaving this tab abandons whatever it had open — `writeParam` inside the
	// selection itself is a no-op once `active` is already false, so it can't
	// clear its own URL param on the way out; the page does that (it owns both
	// tabs' params). This just drops the LOCAL open/selected state so the
	// sheet doesn't linger, hidden, behind the tab that's now on screen.
	createEffect(
		on(
			() => props.active(),
			(active) => {
				if (!active) close();
			},
			{ defer: true }
		)
	);

	// Status the create sheet opens with (a column "+" prefills its own status;
	// the big CTA uses backlog). Nothing is created until the user hits Create.
	const [createStatus, setCreateStatus] = createSignal<TaskStatus>("backlog");

	const nav = createSheetNav({
		items: () => visibleTasks() ?? [],
		currentId: requestedId,
		onSelect: (task) => {
			openRow(task);
		},
	});

	// Column "+": open the create sheet prefilled with that column's status.
	function addToColumn(status: TaskStatus) {
		setCreateStatus(status);
		openCreate();
	}

	return (
		<div class={styles.tab}>
			<Tabs.Actions value="tasks">
				<TasksTabActions
					options={assigneeOptions}
					assignee={assignee}
					onAssigneeChange={setAssignee}
					onNewTask={() => {
						addToColumn("backlog");
					}}
				/>
			</Tabs.Actions>
			<KanbanBoard
				tasks={visibleTasks()}
				people={boardLevel.data() ?? []}
				projects={projects.data() ?? []}
				onCardClick={openRow}
				onCardHoverIntent={selection.intend}
				onAddTask={addToColumn}
			/>
			<TaskSheet
				open={open()}
				prebuild={selection.prebuild()}
				onOpenChange={(isOpen) => {
					if (!isOpen) close();
				}}
				task={selected()}
				loading={loading()}
				initialStatus={createStatus()}
				nav={nav}
			/>
		</div>
	);
}
