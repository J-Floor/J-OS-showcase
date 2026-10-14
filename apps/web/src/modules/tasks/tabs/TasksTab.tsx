import { createEffect, createSignal, on, type JSX } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { createDrawerNav } from "../../../lib/createDrawerNav.ts";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { filterTasksByAssignee } from "../data/taskHelpers.ts";
import { useCurrentPerson, useProjects, useTasks } from "../data/tasksData.tsx";
import { TaskDrawer } from "../drawers/TaskDrawer.tsx";
import { KanbanBoard } from "../kanban/KanbanBoard.tsx";
import type { TaskStatus } from "../kanban/onDrop.ts";

import styles from "./TabShared.module.scss";

/** The tasks, and those shown on the board, narrowed by the assignee filter.
 *  Drives the kanban and the drawer's prev/next nav so navigation stays within
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
	requestNew: () => number;
	/** Active assignee filter: "all", "me", or a person id. */
	assigneeFilter: () => string;
	/** Whether the Tasks tab is the one on screen — gates the `?task=`
	 *  read/write side of the entity selection below. */
	active: () => boolean;
	/** An inbound `?task=` arrived while another tab was showing; switch to
	 *  this tab so the selection below can open it. */
	onNeedTab: (slug: string) => void;
}): JSX.Element {
	const boardLevel = useBoardLevel();
	const projects = useProjects();
	const { tasks, visibleTasks } = useVisibleTasks({
		assigneeFilter: () => props.assigneeFilter(),
	});

	// Bidirectional deep-linking: opening a task writes `?task=<id>`; an
	// inbound `?task=<id>` opens it (switching to this tab first via
	// `onNeedTab` if needed); closing clears the param.
	const { selected, selectedId, open, loading, openRow, openCreate, close } =
		createEntitySelection<Doc<"tasks">>({
			rows: tasks.data,
			param: "task",
			active: () => props.active(),
			onNeedTab: (slug) => {
				props.onNeedTab(slug);
			},
		});

	// Leaving this tab abandons whatever it had open — `writeParam` inside the
	// selection itself is a no-op once `active` is already false, so it can't
	// clear its own URL param on the way out; the page does that (it owns both
	// tabs' params). This just drops the LOCAL open/selected state so the
	// drawer doesn't linger, hidden, behind the tab that's now on screen.
	createEffect(
		on(
			() => props.active(),
			(active) => {
				if (!active) close();
			},
			{ defer: true }
		)
	);

	// Status the create drawer opens with (a column "+" prefills its own status;
	// the big CTA uses backlog). Nothing is created until the user hits Create.
	const [createStatus, setCreateStatus] = createSignal<TaskStatus>("backlog");

	const nav = createDrawerNav({
		items: () => visibleTasks() ?? [],
		currentId: selectedId,
		onSelect: (task) => {
			openRow(task);
		},
	});

	// Column "+": open the create drawer prefilled with that column's status.
	function addToColumn(status: TaskStatus) {
		setCreateStatus(status);
		openCreate();
	}

	// Open the create drawer when the tab-bar "+ Task" button fires (defer so it
	// doesn't open on mount).
	createEffect(
		on(
			() => props.requestNew(),
			() => {
				addToColumn("backlog");
			},
			{ defer: true }
		)
	);

	return (
		<div class={styles.tab}>
			<KanbanBoard
				tasks={visibleTasks()}
				people={boardLevel.data() ?? []}
				projects={projects.data() ?? []}
				onCardClick={openRow}
				onAddTask={addToColumn}
			/>
			<TaskDrawer
				open={open()}
				onOpenChange={(isOpen) => {
					if (!isOpen) close();
				}}
				task={selected()}
				loading={loading()}
				initialStatus={createStatus()}
				people={boardLevel.data() ?? []}
				projects={projects.data() ?? []}
				nav={{
					hasPrev: nav.hasPrev,
					hasNext: nav.hasNext,
					onPrev: nav.prev,
					onNext: nav.next,
				}}
			/>
		</div>
	);
}
