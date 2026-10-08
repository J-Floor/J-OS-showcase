import {
	Button,
	Tabs,
	PermissionDenied,
	Icon,
	Select,
} from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { For, createSignal } from "solid-js";

import { Can } from "../../lib/ability.tsx";
import { createPersistedSignal } from "../../lib/persistedSignal.ts";
import { useBoardLevel } from "../../shared/data/boardLevel.tsx";
import { ICONS } from "../../shared/icons.ts";

import { ASSIGNEE_FILTER_ALL, ASSIGNEE_FILTER_ME } from "./data/taskHelpers.ts";
import { useCurrentPerson } from "./data/tasksData.tsx";
import { ProjectsTab } from "./tabs/ProjectsTab.tsx";
import { TasksTab } from "./tabs/TasksTab.tsx";
import styles from "./TasksPage.module.scss";
import type { ViewMode } from "./timeline/timeline.ts";

const VIEW_OPTIONS = [
	{ value: "day", title: "Day" },
	{ value: "week", title: "Week" },
	{ value: "month", title: "Month" },
];

const TAB_KEYS = ["tasks", "projects"] as const;

/** Board/admin Tasks module: kanban (Tasks) + timeline (Projects). */
export function TasksPage() {
	const [params, setParams] = useSearchParams();
	// Bumped when the tab-bar "+" button is clicked; each tab opens its create
	// drawer in response (the trigger lives in the shared bar, the drawer state
	// stays inside the tab that owns it).
	const [newTaskReq, setNewTaskReq] = createSignal(0);
	const [newProjectReq, setNewProjectReq] = createSignal(0);
	const [projMode, setProjMode] = createSignal<ViewMode>("day");

	/** The tab on screen — `Tabs.Root` falls back for an unrecognised value
	 *  without rewriting the URL, so `?tab=bogus` shows Tasks while the param
	 *  still says `bogus`. */
	function activeTab(): (typeof TAB_KEYS)[number] {
		const value = params.tab;
		return typeof value === "string" &&
			(TAB_KEYS as readonly string[]).includes(value)
			? (value as (typeof TAB_KEYS)[number])
			: "tasks";
	}

	const [jumpToday, setJumpToday] = createSignal(0);

	// Assignee filter for the Tasks board. "Me" leads; "Everyone" (the default)
	// clears it. Self is dropped from the per-person list since "Me" covers it.
	const boardLevel = useBoardLevel();
	const currentPerson = useCurrentPerson();
	// Persisted across reloads so the board keeps a chosen "Me"/person filter.
	const [assignee, setAssignee] = createPersistedSignal(
		"tasks.assigneeFilter",
		ASSIGNEE_FILTER_ALL
	);
	function assigneeOptions() {
		const meId = currentPerson.data()?._id;
		return [
			{ value: ASSIGNEE_FILTER_ME, title: "Me" },
			{ value: ASSIGNEE_FILTER_ALL, title: "Everyone" },
			...(boardLevel.data() ?? [])
				.filter((p) => p._id !== meId)
				.map((p) => ({
					value: p._id,
					title: `${p.firstName} ${p.lastName}`,
				})),
		];
	}

	return (
		<Can I="view" the="Tasks" fallback={<PermissionDenied />}>
			<Tabs.Root
				urlParam={{
					get: () => params.tab,
					set: (v) => {
						// A tab the user picked by hand (zag emits `onValueChange` only
						// from its own events, never from a controlled value change — see
						// CommunityPage) abandons whatever either tab had open: leaving a
						// deep link in the URL for the tab just left would re-open it on
						// refresh, or re-yank the user back via `onNeedTab` below.
						setParams({
							tab: v,
							task: undefined,
							project: undefined,
						});
					},
					fallback: "tasks",
					keys: TAB_KEYS,
				}}
			>
				<div class={styles.tabBar}>
					<Tabs.List>
						<Tabs.Trigger value="tasks">Tasks</Tabs.Trigger>
						<Tabs.Trigger value="projects">Projects</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Actions value="tasks">
						<div class={styles.taskControls}>
							<Select.Root
								options={assigneeOptions()}
								value={[assignee()]}
								sameWidth={false}
								onValueChange={(d) => {
									setAssignee(d.value[0]);
								}}
							>
								<Select.Content>
									<For each={assigneeOptions()}>
										{(o) => (
											<Select.Option
												value={o.value}
												title={o.title}
											/>
										)}
									</For>
								</Select.Content>
							</Select.Root>
							<Button
								onClick={() => {
									setNewTaskReq((n) => n + 1);
								}}
							>
								<Icon>{ICONS.add}</Icon> New task
							</Button>
						</div>
					</Tabs.Actions>
					<Tabs.Actions value="projects">
						<div class={styles.projectControls}>
							<Button
								variant="secondary"
								onClick={() => {
									setJumpToday((n) => n + 1);
								}}
							>
								<Icon>today</Icon> Today
							</Button>
							<Select.Root
								options={VIEW_OPTIONS}
								value={[projMode()]}
								onValueChange={(d) => {
									setProjMode(d.value[0] as ViewMode);
								}}
							>
								<Select.Content>
									<For each={VIEW_OPTIONS}>
										{(o) => (
											<Select.Option
												value={o.value}
												title={o.title}
											/>
										)}
									</For>
								</Select.Content>
							</Select.Root>
							<Button
								onClick={() => {
									setNewProjectReq((n) => n + 1);
								}}
							>
								<Icon>{ICONS.add}</Icon> New project
							</Button>
						</div>
					</Tabs.Actions>
				</div>
				<Tabs.Content value="tasks">
					<TasksTab
						requestNew={newTaskReq}
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
						requestNew={newProjectReq}
						mode={projMode}
						jumpToday={jumpToday}
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
