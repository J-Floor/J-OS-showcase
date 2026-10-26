// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { PeekContext } from "../../shared/entity/PeekContext.tsx";

import { projectEntity, taskEntity } from "./entity.ts";
import { TaskPeek } from "./TaskPeek.tsx";

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));
vi.mock("../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("./data/tasksData.tsx", async (importOriginal) => ({
	...(await importOriginal<typeof import("./data/tasksData.tsx")>()),
	useProjects: () => ({ data: () => [] }),
}));

afterEach(cleanup);

const task = {
	_id: "task-1",
	_creationTime: 0,
	title: "Fix the gutter",
	status: "backlog",
	assigneeIds: [],
} as never;

test("both kinds have a peek", () => {
	expect(taskEntity.peek).toBeDefined();
	expect(projectEntity.peek).toBeDefined();
});

test("the task peek shows the row and the link to its page, without arrows", () => {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<PeekContext.Provider
						value={{
							viewIn: {
								label: `View in ${taskEntity.group}`,
								href: "/tasks?task=task-1",
							},
						}}
					>
						<TaskPeek
							row={task}
							loading={false}
							open
							prebuild={false}
							onOpenChange={() => {}}
						/>
					</PeekContext.Provider>
				)}
			/>
		</MemoryRouter>
	));
	expect(screen.getByDisplayValue("Fix the gutter")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "View in Tasks" })
	).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
	expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
});
