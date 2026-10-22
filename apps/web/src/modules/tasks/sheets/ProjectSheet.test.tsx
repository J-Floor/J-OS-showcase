// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { sheetSkeleton } from "../../../../test-stubs/morphKeys.tsx";

afterEach(cleanup);

beforeAll(() => {
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
	if (
		!(Element.prototype as { hasPointerCapture?: unknown })
			.hasPointerCapture
	) {
		Element.prototype.hasPointerCapture = () => false;
	}
});

// Mock convex-solidjs so ProjectSheet's useProjectActions doesn't need a
// ConvexProvider. useMutation ignores its argument here, so the real
// generated api module (imported by tasksData.tsx) can load unmocked.
vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
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
			people={[]}
			projects={[]}
			tasks={[]}
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
			project={project}
			people={[]}
			projects={[]}
			tasks={[]}
			onTaskClick={() => {}}
			loading
		/>
	));
	expect(screen.queryByDisplayValue("Renovation")).toBeNull();
	expect(screen.queryByText("Project")).toBeNull();
});

test("no project, not loading: shows the create form and 'New project' title", () => {
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			people={[]}
			projects={[]}
			tasks={[]}
			onTaskClick={() => {}}
		/>
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
			project={project}
			people={[]}
			projects={[]}
			tasks={undefined}
			onTaskClick={() => {}}
		/>
	));
	expect(document.querySelector("[data-skeleton-list]")).toBeInTheDocument();
	expect(screen.queryByText("No tasks yet.")).toBeNull();
});

test("tasks empty: shows 'No tasks yet.'", () => {
	render(() => (
		<ProjectSheet
			open
			onOpenChange={() => {}}
			project={project}
			people={[]}
			projects={[]}
			tasks={[]}
			onTaskClick={() => {}}
		/>
	));
	expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
	expect(document.querySelector("[data-skeleton-list]")).toBeNull();
});
