// @vitest-environment happy-dom
import { ShortcutPeekProvider, Tabs } from "@j-os/design-system";
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { ShortcutPeekButton } from "../../../shared/ShortcutPeekButton.tsx";

const { taskRows, kanbanTasks, kanbanSelection } = vi.hoisted(() => ({
	taskRows: { current: undefined as unknown[] | undefined },
	kanbanTasks: [] as unknown[],
	kanbanSelection: {
		current: undefined as
			| { setSelected: (ids: Set<string>) => void }
			| undefined,
	},
}));

vi.mock("../data/tasksData.tsx", () => ({
	useTasks: () => ({ data: () => taskRows.current }),
	useProjects: () => ({ data: () => [] }),
	useCurrentPerson: () => ({ data: () => {} }),
	useTaskActions: () => ({ remove: vi.fn() }),
}));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../kanban/KanbanBoard.tsx", () => ({
	KanbanBoard: (props: {
		tasks: unknown;
		onCardHoverIntent: () => void;
		cards: { selection: { setSelected: (ids: Set<string>) => void } };
	}) => {
		// eslint-disable-next-line solid/reactivity -- records the first value handed in
		kanbanTasks.push(props.tasks);
		// eslint-disable-next-line solid/reactivity -- the selection is created once
		kanbanSelection.current = props.cards.selection;
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
	kanbanSelection.current = undefined;
});

function renderTab(isActive = true) {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<Tabs.Root value="tasks">
						<Tabs.Bar />
						<TasksTab
							active={() => isActive}
							onNeedTab={() => {}}
						/>
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

function isSheetOpen(): boolean {
	return (
		screen.getByTestId("task-sheet").getAttribute("data-open") === "true"
	);
}

test("N opens the create sheet, once, from anywhere on the tab", () => {
	renderTab();
	fireEvent.keyDown(document.body, { key: "n" });
	expect(isSheetOpen()).toBe(true);
});

test("N is ignored while typing", () => {
	renderTab();
	const field = document.createElement("input");
	document.body.append(field);
	fireEvent.keyDown(field, { key: "n" });
	field.remove();
	expect(isSheetOpen()).toBe(false);
});

test("N is ignored while the tab is not the one on screen", () => {
	renderTab(false);
	fireEvent.keyDown(document.body, { key: "n" });
	expect(isSheetOpen()).toBe(false);
});

test("New task names its key, and shows the chip while peeking", () => {
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<MemoryRouter>
				<Route
					path="*"
					component={() => (
						<Tabs.Root value="tasks">
							<Tabs.Bar />
							<TasksTab
								active={() => true}
								onNeedTab={() => {}}
							/>
						</Tabs.Root>
					)}
				/>
			</MemoryRouter>
		</ShortcutPeekProvider>
	));
	const button = screen.getByRole("button", { name: /New task/ });
	expect(button).toHaveAttribute("aria-keyshortcuts", "N");
	expect(button.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(button.querySelector("kbd")).not.toBeNull();
});

test("Delete N selected joins the tab bar while cards are selected, so the board does not move", () => {
	taskRows.current = [];
	const { container } = renderTab();
	expect(screen.queryByRole("button", { name: /selected/ })).toBeNull();
	kanbanSelection.current?.setSelected(new Set(["a", "b"]));
	const button = screen.getByRole("button", { name: /Delete 2 selected/ });
	const bar = container.querySelector('[data-part="tab-actions"]');
	expect(bar).toContainElement(button);
});
