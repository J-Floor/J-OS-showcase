// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { taskRows, kanbanTasks } = vi.hoisted(() => ({
	taskRows: { current: undefined as unknown[] | undefined },
	kanbanTasks: [] as unknown[],
}));

vi.mock("../data/tasksData.tsx", () => ({
	useTasks: () => ({ data: () => taskRows.current }),
	useProjects: () => ({ data: () => [] }),
	useCurrentPerson: () => ({ data: () => undefined }),
}));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../kanban/KanbanBoard.tsx", () => ({
	KanbanBoard: (props: { tasks: unknown }) => {
		// eslint-disable-next-line solid/reactivity -- records the first value handed in
		kanbanTasks.push(props.tasks);
		return null;
	},
}));
vi.mock("../drawers/TaskDrawer.tsx", () => ({ TaskDrawer: () => null }));

import { TasksTab } from "./TasksTab.tsx";

afterEach(() => {
	cleanup();
	taskRows.current = undefined;
	kanbanTasks.length = 0;
});

function renderTab() {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<TasksTab
						requestNew={() => 0}
						assigneeFilter={() => "all"}
						active={() => true}
						onNeedTab={() => undefined}
					/>
				)}
			/>
		</MemoryRouter>
	));
}

test("hands the board undefined while tasks load, not an empty list", () => {
	renderTab();
	expect(kanbanTasks).toEqual([undefined]);
});

test("hands the board the loaded tasks", () => {
	taskRows.current = [];
	renderTab();
	expect(kanbanTasks).toEqual([[]]);
});
