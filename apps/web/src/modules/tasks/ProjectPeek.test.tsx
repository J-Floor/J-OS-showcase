// @vitest-environment happy-dom
import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	useLocation,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { PeekContext } from "../../shared/entity/PeekContext.tsx";

import { projectEntity } from "./entity.ts";
import { ProjectPeek } from "./ProjectPeek.tsx";

const { taskRows } = vi.hoisted(() => ({
	taskRows: { current: undefined as unknown[] | undefined },
}));

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
	useTasks: () => ({ data: () => taskRows.current }),
}));

afterEach(() => {
	cleanup();
	taskRows.current = undefined;
});

const project = {
	_id: "project-1",
	_creationTime: 0,
	name: "Renovation",
	createdBy: "person1",
} as never;

const seen: { location?: ReturnType<typeof useLocation> } = {};

function renderPeek(history = createMemoryHistory()) {
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => {
					seen.location = useLocation();
					return (
						<PeekContext.Provider
							value={{
								viewIn: {
									label: `View in ${projectEntity.group}`,
									href: "/tasks?tab=projects&project=project-1",
								},
							}}
						>
							<ProjectPeek
								row={project}
								loading={false}
								open
								prebuild={false}
								onOpenChange={() => {}}
							/>
						</PeekContext.Provider>
					);
				}}
			/>
		</MemoryRouter>
	));
}

test("the project peek shows the row and the link to its page, without arrows", () => {
	renderPeek();
	expect(screen.getByDisplayValue("Renovation")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "View in Projects" })
	).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
	expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
});

test("a task of the project opens as a task peek", async () => {
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
	renderPeek();
	fireEvent.click(screen.getByText("Fix the gutter"));
	await waitFor(() => {
		expect(decodeURIComponent(seen.location?.search ?? "")).toContain(
			"open=task:task-1"
		);
	});
});

test("closing a task peek opened from a project peek returns to the page", async () => {
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
	const history = createMemoryHistory();
	history.set({ value: "/events" });
	renderPeek(history);
	// The project peek opens on top of the page, as a palette pick does.
	history.set({ value: "/events?open=project%3Aproject-1" });
	await waitFor(() => {
		expect(decodeURIComponent(seen.location?.search ?? "")).toContain(
			"open=project:project-1"
		);
	});
	fireEvent.click(screen.getByText("Fix the gutter"));
	await waitFor(() => {
		expect(decodeURIComponent(seen.location?.search ?? "")).toContain(
			"open=task:task-1"
		);
	});
	history.back();
	await waitFor(() => {
		expect(seen.location?.pathname).toBe("/events");
		expect(seen.location?.search).toBe("");
	});
});
