// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

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

// Mock convex-solidjs so TaskDrawer's useTaskActions doesn't need a ConvexProvider.
vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => undefined }),
}));

// Mock the Convex API barrel (not a real module in test context).
vi.mock("../../../../../convex/_generated/api", () => ({ api: {} }));

import { TaskDrawer } from "./TaskDrawer.tsx";

const task = {
	_id: "task-1",
	_creationTime: 0,
	title: "Fix the bug",
	status: "backlog",
	assigneeIds: [],
} as never;

describe("TaskDrawer nav prop", () => {
	test("renders Previous and Next buttons when nav is provided", () => {
		const onPrev = vi.fn();
		const onNext = vi.fn();
		render(() => (
			<TaskDrawer
				open
				onOpenChange={() => {}}
				task={task}
				people={[]}
				projects={[]}
				nav={{
					hasPrev: () => true,
					hasNext: () => true,
					onPrev,
					onNext,
				}}
			/>
		));
		expect(
			screen.getByRole("button", { name: /previous/i })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /next/i })
		).toBeInTheDocument();
	});

	test("calls onPrev / onNext when buttons are clicked", () => {
		const onPrev = vi.fn();
		const onNext = vi.fn();
		render(() => (
			<TaskDrawer
				open
				onOpenChange={() => {}}
				task={task}
				people={[]}
				projects={[]}
				nav={{
					hasPrev: () => true,
					hasNext: () => true,
					onPrev,
					onNext,
				}}
			/>
		));
		fireEvent.click(screen.getByRole("button", { name: /previous/i }));
		expect(onPrev).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	test("nav buttons are absent when nav prop is not provided", () => {
		render(() => (
			<TaskDrawer
				open
				onOpenChange={() => {}}
				task={task}
				people={[]}
				projects={[]}
			/>
		));
		expect(
			screen.queryByRole("button", { name: /previous/i })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /next/i })
		).not.toBeInTheDocument();
	});
});

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows a skeleton, not the create form or the 'New task' title", () => {
	render(() => (
		<TaskDrawer
			open
			onOpenChange={() => {}}
			people={[]}
			projects={[]}
			loading
		/>
	));
	expect(screen.queryByText("New task")).toBeNull();
	expect(screen.queryByLabelText("Title")).toBeNull();
	expect(screen.queryByRole("button", { name: /Create task/ })).toBeNull();
	expect(
		document.querySelector("[data-drawer-skeleton]")
	).toBeInTheDocument();
	expect(screen.getByText("Assignees")).toBeInTheDocument();
});

test("loading with a task also set (stale-during-refetch) still shows the skeleton, not the title", () => {
	render(() => (
		<TaskDrawer
			open
			onOpenChange={() => {}}
			task={task}
			people={[]}
			projects={[]}
			loading
		/>
	));
	expect(screen.queryByDisplayValue("Fix the bug")).toBeNull();
	expect(screen.queryByText("Task")).toBeNull();
});

test("no task, not loading: shows the create form and 'New task' title", () => {
	render(() => (
		<TaskDrawer open onOpenChange={() => {}} people={[]} projects={[]} />
	));
	expect(screen.getByText("New task")).toBeInTheDocument();
	expect(screen.getByLabelText("Title")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create task/ })
	).toBeInTheDocument();
});
