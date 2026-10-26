// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, describe, expect, test, vi } from "vitest";

import { sheetSkeleton } from "../../../../test-stubs/morphKeys.tsx";

afterEach(cleanup);

// Mock convex-solidjs so TaskSheet's useTaskActions doesn't need a ConvexProvider.
vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));

// Mock the Convex API barrel (not a real module in test context).
vi.mock("../../../../../convex/_generated/api", () => ({ api: {} }));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../data/tasksData.tsx", async (importOriginal) => ({
	...(await importOriginal<typeof import("../data/tasksData.tsx")>()),
	useProjects: () => ({ data: () => [] }),
}));

import { TaskSheet } from "./TaskSheet.tsx";

const task = {
	_id: "task-1",
	_creationTime: 0,
	title: "Fix the bug",
	status: "backlog",
	assigneeIds: [],
} as never;

describe("TaskSheet nav prop", () => {
	test("renders Previous and Next buttons when nav is provided", () => {
		const onPrev = vi.fn();
		const onNext = vi.fn();
		render(() => (
			<TaskSheet
				open
				onOpenChange={() => {}}
				task={task}
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
			<TaskSheet
				open
				onOpenChange={() => {}}
				task={task}
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
		render(() => <TaskSheet open onOpenChange={() => {}} task={task} />);
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
	render(() => <TaskSheet open onOpenChange={() => {}} loading />);
	expect(screen.queryByText("New task")).toBeNull();
	expect(screen.queryByLabelText("Title")).toBeNull();
	expect(screen.queryByRole("button", { name: /Create task/ })).toBeNull();
	expect(sheetSkeleton()).toBeInTheDocument();
	expect(screen.getByText("Assignees")).toBeInTheDocument();
});

test("loading with a task also set (stale-during-refetch) still shows the skeleton, not the title", () => {
	render(() => (
		<TaskSheet open onOpenChange={() => {}} task={task} loading />
	));
	expect(screen.queryByDisplayValue("Fix the bug")).toBeNull();
	expect(screen.queryByText("Task")).toBeNull();
});

test("create: a typed title asks before Escape throws it away", async () => {
	const onOpenChange = vi.fn();
	render(() => <TaskSheet open onOpenChange={onOpenChange} />);
	fireEvent.input(screen.getByLabelText("Title"), {
		target: { value: "Fix the bug" },
	});
	const sheet = screen.getByRole("dialog", { name: "New task" });
	// Ark hears Escape a moment after the open: press until it asks.
	await waitFor(() => {
		if (!screen.queryByRole("dialog", { name: "Discard new task?" }))
			fireEvent.keyDown(sheet, { key: "Escape" });
		expect(
			screen.getByRole("dialog", { name: "Discard new task?" })
		).toBeInTheDocument();
	});
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("no task, not loading: shows the create form and 'New task' title", () => {
	render(() => <TaskSheet open onOpenChange={() => {}} />);
	expect(screen.getByText("New task")).toBeInTheDocument();
	expect(screen.getByLabelText("Title")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create task/ })
	).toBeInTheDocument();
});
