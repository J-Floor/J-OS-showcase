// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { sheetSkeleton } from "../../../../test-stubs/morphKeys.tsx";

afterEach(() => {
	cleanup();
	taskRows.current = undefined;
});

// Mock convex-solidjs so ProjectSheet's useProjectActions doesn't need a
// ConvexProvider. useMutation ignores its argument here, so the real
// generated api module (imported by tasksData.tsx) can load unmocked.
vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));

const { taskRows } = vi.hoisted(() => ({
	taskRows: { current: undefined as unknown[] | undefined },
}));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../data/tasksData.tsx", async (importOriginal) => ({
	...(await importOriginal<typeof import("../data/tasksData.tsx")>()),
	useProjects: () => ({ data: () => [] }),
	useTasks: () => ({ data: () => taskRows.current }),
}));

import { ProjectSheet } from "./ProjectSheet.tsx";

const project = {
	_id: "project-1",
	_creationTime: 0,
	name: "Renovation",
	createdBy: "person1",
} as never;

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows a skeleton, not the create form or the 'New project' title", () => {
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			onTaskClick={() => {}}
			loading
		/>
	));
	expect(screen.queryByText("New project")).toBeNull();
	expect(screen.queryByPlaceholderText("Project name")).toBeNull();
	expect(screen.queryByRole("button", { name: /Create project/ })).toBeNull();
	expect(sheetSkeleton()).toBeInTheDocument();
	expect(screen.getByText("Leader")).toBeInTheDocument();
});

test("loading with a project also set (stale-during-refetch) still shows the skeleton, not the name", () => {
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			onTaskClick={() => {}}
			project={project}
			loading
		/>
	));
	expect(screen.queryByDisplayValue("Renovation")).toBeNull();
	expect(screen.queryByText("Project")).toBeNull();
});

test("no project, not loading: shows the create form and 'New project' title", () => {
	render(() => (
		<ProjectSheet open onOpenChange={() => {}} onTaskClick={() => {}} />
	));
	expect(screen.getByText("New project")).toBeInTheDocument();
	expect(screen.getByPlaceholderText("Project name")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create project/ })
	).toBeInTheDocument();
});

test("tasks undefined: shows a skeleton list, not 'No tasks yet.'", () => {
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			onTaskClick={() => {}}
			project={project}
		/>
	));
	expect(document.querySelector("[data-skeleton-list]")).toBeInTheDocument();
	expect(screen.queryByText("No tasks yet.")).toBeNull();
});

test("tasks empty: shows 'No tasks yet.'", () => {
	taskRows.current = [];
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			onTaskClick={() => {}}
			project={project}
		/>
	));
	expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
	expect(document.querySelector("[data-skeleton-list]")).toBeNull();
});

test("on a page (no peek) a task click calls the tab's handler and leaves the URL alone", () => {
	taskRows.current = [
		{
			_id: "task-1",
			_creationTime: 0,
			title: "Fix the gutter",
			status: "backlog",
			assigneeIds: [],
			projectId: "project-1",
		},
	];
	const onTaskClick = vi.fn();
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			project={project}
			onTaskClick={onTaskClick}
		/>
	));
	fireEvent.click(screen.getByText("Fix the gutter"));
	expect(onTaskClick).toHaveBeenCalledTimes(1);
	expect(onTaskClick).toHaveBeenCalledWith(
		expect.objectContaining({ _id: "task-1" })
	);
	expect(window.location.search).not.toContain("open=");
});
