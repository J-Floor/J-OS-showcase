import { Tabs, PermissionDenied } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";

import { Can } from "../../lib/ability.tsx";
import { tabKeyOf } from "../../shared/tabKey.ts";

import { ProjectsTab } from "./tabs/ProjectsTab.tsx";
import { TasksTab } from "./tabs/TasksTab.tsx";

const TAB_KEYS = ["tasks", "projects"] as const;

type TasksTabKey = (typeof TAB_KEYS)[number];

/** Board/admin Tasks module: kanban (Tasks) + timeline (Projects). */
export function TasksPage() {
	const [params, setParams] = useSearchParams();

	/** The tab on screen — `Tabs.Root` falls back for an unrecognised value
	 *  without rewriting the URL, so `?tab=bogus` shows Tasks while the param
	 *  still says `bogus`. */
	function activeTab(): TasksTabKey {
		return tabKeyOf(TAB_KEYS, params.tab, "tasks");
	}

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
				</Tabs.Bar>
				<Tabs.Content value="tasks">
					<TasksTab
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
