import { Tabs, PermissionDenied } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createSignal } from "solid-js";

import { displayName } from "../../../convex/lib/names.ts";
import { Can } from "../../lib/ability.tsx";
import { createPersistedSignal } from "../../lib/persistedSignal.ts";
import { useBoardLevel } from "../../shared/data/boardLevel.tsx";
import { tabKeyOf } from "../../shared/tabKey.ts";

import { ASSIGNEE_FILTER_ALL, ASSIGNEE_FILTER_ME } from "./data/taskHelpers.ts";
import { useCurrentPerson } from "./data/tasksData.tsx";
import { ProjectsTab } from "./tabs/ProjectsTab.tsx";
import { TasksTab } from "./tabs/TasksTab.tsx";
import { ProjectTabActions, TasksTabActions } from "./TasksTabActions.tsx";
import type { ViewMode } from "./timeline/timeline.ts";

const TAB_KEYS = ["tasks", "projects"] as const;

type TasksTabKey = (typeof TAB_KEYS)[number];

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
				{ value: ASSIGNEE_FILTER_ME, title: "Me" },
				{ value: ASSIGNEE_FILTER_ALL, title: "Everyone" },
				...(boardLevel.data() ?? [])
					.filter((person) => person._id !== meId)
					.map((person) => ({
						value: person._id,
						title: displayName(person),
					})),
			];
		},
	};
}

/** What the shared tab bar tells the tabs. The "+" and "Today" buttons bump a
 *  counter; each tab opens its create sheet (or recentres) in response — the
 *  trigger lives in the shared bar, the sheet state stays inside the tab that
 *  owns it. */
function createToolbarState() {
	const [newTaskRequest, setNewTaskRequest] = createSignal(0);
	const [newProjectRequest, setNewProjectRequest] = createSignal(0);
	const [jumpToday, setJumpToday] = createSignal(0);
	const [projMode, setProjMode] = createSignal<ViewMode>("day");
	return {
		newTaskRequest,
		newProjectRequest,
		jumpToday,
		projMode,
		setProjMode,
		requestNewTask: (): void => {
			setNewTaskRequest((count) => count + 1);
		},
		requestNewProject: (): void => {
			setNewProjectRequest((count) => count + 1);
		},
		requestJumpToday: (): void => {
			setJumpToday((count) => count + 1);
		},
	};
}

/** Board/admin Tasks module: kanban (Tasks) + timeline (Projects). */
export function TasksPage() {
	const [params, setParams] = useSearchParams();
	const toolbar = createToolbarState();

	/** The tab on screen — `Tabs.Root` falls back for an unrecognised value
	 *  without rewriting the URL, so `?tab=bogus` shows Tasks while the param
	 *  still says `bogus`. */
	function activeTab(): TasksTabKey {
		return tabKeyOf(TAB_KEYS, params.tab, "tasks");
	}

	const { assignee, setAssignee, assigneeOptions } = createAssigneeFilter();

	return (
		<Can I="view" the="Tasks" fallback={<PermissionDenied />}>
			<Tabs.Root
				urlParam={{
					get: () => params.tab,
					set: (value) => {
						// A tab the user picked by hand (zag emits `onValueChange` only
						// from its own events, never from a controlled value change — see
						// CommunityPage) abandons whatever either tab had open: leaving a
						// deep link in the URL for the tab just left would re-open it on
						// refresh, or re-yank the user back via `onNeedTab` below.
						setParams({
							tab: value,
							task: undefined,
							project: undefined,
						});
					},
					fallback: "tasks",
					keys: TAB_KEYS,
				}}
			>
				<Tabs.Bar>
					<Tabs.List>
						<Tabs.Trigger value="tasks">Tasks</Tabs.Trigger>
						<Tabs.Trigger value="projects">Projects</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Actions value="tasks">
						<TasksTabActions
							options={assigneeOptions}
							assignee={assignee}
							onAssigneeChange={setAssignee}
							onNewTask={toolbar.requestNewTask}
						/>
					</Tabs.Actions>
					<Tabs.Actions value="projects">
						<ProjectTabActions
							mode={toolbar.projMode}
							onModeChange={toolbar.setProjMode}
							onJumpToday={toolbar.requestJumpToday}
							onNewProject={toolbar.requestNewProject}
						/>
					</Tabs.Actions>
				</Tabs.Bar>
				<Tabs.Content value="tasks">
					<TasksTab
						requestNew={toolbar.newTaskRequest}
						assigneeFilter={assignee}
						active={() => activeTab() === "tasks"}
						onNeedTab={() => {
							// Clear the sibling param, not `task` — it's the very id this
							// switch exists to open, and would otherwise be wiped before
							// the Tasks tab's own selection got a chance to read it.
							setParams(
								{ tab: "tasks", project: undefined },
								{ replace: true }
							);
						}}
					/>
				</Tabs.Content>
				<Tabs.Content value="projects">
					<ProjectsTab
						requestNew={toolbar.newProjectRequest}
						mode={toolbar.projMode}
						jumpToday={toolbar.jumpToday}
						active={() => activeTab() === "projects"}
						onNeedTab={() => {
							// Symmetric with the Tasks tab's onNeedTab above: clear the
							// sibling param, keep `project` intact.
							setParams(
								{ tab: "projects", task: undefined },
								{ replace: true }
							);
						}}
					/>
				</Tabs.Content>
			</Tabs.Root>
		</Can>
	);
}
