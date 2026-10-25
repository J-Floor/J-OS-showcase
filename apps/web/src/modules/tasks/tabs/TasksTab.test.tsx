// @vitest-environment happy-dom
import { Tabs } from "@j-os/design-system";
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { taskRows, kanbanTasks } = vi.hoisted(() => ({
	taskRows: { current: undefined as unknown[] | undefined },
	kanbanTasks: [] as unknown[],
}));

vi.mock("../data/tasksData.tsx", () => ({
	useTasks: () => ({ data: () => taskRows.current }),
	useProjects: () => ({ data: () => [] }),
	useCurrentPerson: () => ({ data: () => {} }),
}));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../kanban/KanbanBoard.tsx", () => ({
	KanbanBoard: (props: { tasks: unknown; onCardHoverIntent: () => void }) => {
		// eslint-disable-next-line solid/reactivity -- records the first value handed in
		kanbanTasks.push(props.tasks);
		return (
			<button
				type="button"
				onClick={() => {
					props.onCardHoverIntent();
				}}
			>
				rest on a card
			</button>
		);
	},
}));
vi.mock("../sheets/TaskSheet.tsx", () => ({
	TaskSheet: (props: { open: boolean; prebuild?: boolean }) => (
		<div
			data-testid="task-sheet"
			data-open={String(props.open)}
			data-prebuild={String(props.prebuild)}
		/>
	),
}));

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
					<Tabs.Root value="tasks">
						<Tabs.Bar />
						<TasksTab active={() => true} onNeedTab={() => {}} />
					</Tabs.Root>
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

test("its New task action sits in the tab bar and opens the create sheet", () => {
	const { container } = renderTab();
	const bar = container.querySelector('[data-part="tab-actions"]');
	const button = screen.getByRole("button", { name: /New task/ });
	expect(bar).toContainElement(button);
	expect(screen.getByTestId("task-sheet")).toHaveAttribute(
		"data-open",
		"false"
	);
	fireEvent.click(button);
	expect(screen.getByTestId("task-sheet")).toHaveAttribute(
		"data-open",
		"true"
	);
});

test("resting on a card builds the sheet before it opens", () => {
	taskRows.current = [];
	renderTab();
	const sheet = screen.getByTestId("task-sheet");
	expect(sheet).toHaveAttribute("data-prebuild", "false");
	fireEvent.click(screen.getByRole("button", { name: "rest on a card" }));
	expect(sheet).toHaveAttribute("data-prebuild", "true");
	expect(sheet).toHaveAttribute("data-open", "false");
});
