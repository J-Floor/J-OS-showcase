// @vitest-environment happy-dom
//
// Bidirectional deep-linking for Tasks/Projects: opening a card writes
// `?task=<id>`/`?project=<id>`, an inbound link switches to the right tab and
// opens the row, and closing clears the param. Mirrors EventsPage's and
// CommunityPage's own deep-link tests. The heavy visual children (kanban
// board, timeline, sheets) are stubbed to capture props, so this exercises
// the real `createEntitySelection` wiring inside TasksTab/ProjectsTab without
// dragging in drag-and-drop/measurement-heavy UI.
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const TASK1 = {
	_id: "task1",
	_creationTime: 0,
	title: "Fix the leak",
	status: "backlog",
	assigneeIds: [],
	createdBy: "person1",
};

const PROJECT1 = {
	_id: "proj1",
	_creationTime: 0,
	name: "Launch",
	startDate: Date.parse("2026-01-01"),
	endDate: Date.parse("2026-02-01"),
	createdBy: "person1",
};

vi.mock("./data/tasksData.tsx", () => ({
	useTasks: () => ({
		data: () => [TASK1],
		error: () => {},
		isLoading: () => false,
	}),
	useProjects: () => ({
		data: () => [PROJECT1],
		error: () => {},
		isLoading: () => false,
	}),
	useCurrentPerson: () => ({
		data: () => {},
		error: () => {},
		isLoading: () => false,
	}),
	useTaskActions: () => ({
		create: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
	}),
	useProjectActions: () => ({
		create: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
	}),
}));

vi.mock("../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({
		data: () => [],
		error: () => {},
		isLoading: () => false,
	}),
}));

// Leaf/visual children, stubbed to capture the props TasksTab/ProjectsTab hand
// them — the test drives the deep-link flow by calling the captured callbacks
// directly, same as CommunityPage.test.tsx's tab stubs.
type Rec = Record<string, unknown>;
const kanbanProps: Rec[] = [];
vi.mock("./kanban/KanbanBoard.tsx", () => ({
	KanbanBoard: (props: Rec) => {
		kanbanProps.push(props);
		return <div>kanban-board</div>;
	},
}));

const taskSheetProps: Rec[] = [];
vi.mock("./sheets/TaskSheet.tsx", () => ({
	TaskSheet: (props: Rec) => {
		taskSheetProps.push(props);
		return <div>task-sheet</div>;
	},
}));

const projectTimelineProps: Rec[] = [];
vi.mock("./timeline/ProjectTimeline.tsx", () => ({
	ProjectTimeline: (props: Rec) => {
		projectTimelineProps.push(props);
		return <div>project-timeline</div>;
	},
}));

const projectSheetProps: Rec[] = [];
vi.mock("./sheets/ProjectSheet.tsx", () => ({
	ProjectSheet: (props: Rec) => {
		projectSheetProps.push(props);
		return <div>project-sheet</div>;
	},
}));

import { AbilityProvider } from "../../lib/ability.tsx";

import { TasksPage } from "./TasksPage.tsx";

afterEach(() => {
	kanbanProps.length = 0;
	taskSheetProps.length = 0;
	projectTimelineProps.length = 0;
	projectSheetProps.length = 0;
});

function renderAtPath(path: string) {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	return {
		...render(() => (
			<MemoryRouter history={history}>
				<Route
					path="*"
					component={() => (
						<AbilityProvider role="board">
							<TasksPage />
						</AbilityProvider>
					)}
				/>
			</MemoryRouter>
		)),
		history,
	};
}

// `TaskSheet` is mocked once but rendered by TWO components: the Tasks tab's
// own (URL-linked) sheet, mounted first, and the Projects tab's nested
// task-from-a-project view (unrelated to `?task=`), mounted second — so the
// Tasks tab's props are always `taskSheetProps[0]`, never `.at(-1)`.
function mainTaskSheetProps() {
	return taskSheetProps[0];
}

test("opening a task writes ?task=<id>", async () => {
	const { history } = renderAtPath("/tasks");
	await waitFor(() => {
		expect(kanbanProps.length).toBeGreaterThan(0);
	});
	const onCardClick = kanbanProps.at(-1)?.onCardClick as (t: unknown) => void;
	onCardClick(TASK1);
	await waitFor(() => {
		expect(history.get()).toContain("task=task1");
	});
	expect(mainTaskSheetProps().open).toBe(true);
});

test("closing the task sheet clears ?task=", async () => {
	const { history } = renderAtPath("/tasks?task=task1");
	await waitFor(() => {
		expect(mainTaskSheetProps().open).toBe(true);
	});
	expect(history.get()).toContain("task=task1");
	const onOpenChange = mainTaskSheetProps().onOpenChange as (
		isOpen: boolean
	) => void;
	onOpenChange(false);
	await waitFor(() => {
		expect(history.get()).not.toContain("task=");
	});
	expect(mainTaskSheetProps().open).toBe(false);
});

test("an inbound /tasks?project=<id> switches to the Projects tab and opens it", async () => {
	renderAtPath("/tasks?project=proj1");
	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Projects" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	await waitFor(() => {
		expect(projectSheetProps.at(-1)?.open).toBe(true);
	});
	expect(
		(projectSheetProps.at(-1)?.project as typeof PROJECT1 | undefined)?._id
	).toBe("proj1");
	// The Tasks tab, mounted behind it, never opened anything for this link.
	expect(mainTaskSheetProps().open).toBe(false);
});

test("opening a project from the timeline writes ?project=<id>", async () => {
	const { history } = renderAtPath("/tasks?tab=projects");
	await waitFor(() => {
		expect(projectTimelineProps.length).toBeGreaterThan(0);
	});
	const onSelect = projectTimelineProps.at(-1)?.onSelect as (
		id: string
	) => void;
	onSelect("proj1");
	await waitFor(() => {
		expect(history.get()).toContain("project=proj1");
	});
	expect(projectSheetProps.at(-1)?.open).toBe(true);
});

test("closing the project sheet clears ?project=", async () => {
	const { history } = renderAtPath("/tasks?tab=projects&project=proj1");
	await waitFor(() => {
		expect(projectSheetProps.at(-1)?.open).toBe(true);
	});
	const onOpenChange = projectSheetProps.at(-1)?.onOpenChange as (
		isOpen: boolean
	) => void;
	onOpenChange(false);
	await waitFor(() => {
		expect(history.get()).not.toContain("project=");
	});
});

test("switching tabs by hand abandons the open task: URL and sheet both clear", async () => {
	const { history } = renderAtPath("/tasks");
	await waitFor(() => {
		expect(kanbanProps.length).toBeGreaterThan(0);
	});
	const onCardClick = kanbanProps.at(-1)?.onCardClick as (t: unknown) => void;
	onCardClick(TASK1);
	await waitFor(() => {
		expect(history.get()).toContain("task=task1");
	});

	fireEvent.click(screen.getByRole("tab", { name: "Projects" }));

	await waitFor(() => {
		expect(screen.getByRole("tab", { name: "Projects" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
	// The stale ?task= must not survive the switch — left in place, it would
	// re-open on refresh and (via `onNeedTab`) yank the user straight back to
	// the Tasks tab the moment this component re-mounted.
	expect(history.get()).not.toContain("task=");
	await waitFor(() => {
		expect(mainTaskSheetProps().open).toBe(false);
	});
});
