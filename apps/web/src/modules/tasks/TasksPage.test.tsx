// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";
afterEach(cleanup);

vi.mock("./tabs/TasksTab.tsx", () => ({
	TasksTab: () => <div>tasks-tab</div>,
}));
vi.mock("./tabs/ProjectsTab.tsx", () => ({
	ProjectsTab: () => <div>projects-tab</div>,
}));

// TasksPage now reads the board-level list + current person for the assignee filter; stub the
// Convex client so those queries resolve to empty without a ConvexProvider.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => undefined,
		error: () => undefined,
		isLoading: () => false,
	}),
}));

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { TasksPage } from "./TasksPage.tsx";

// MemoryRouter is required because TasksPage now uses useSearchParams to keep
// the active tab in the URL.
function renderAs(role: Role) {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<TasksPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

test("board sees both tab triggers", () => {
	renderAs("board");
	expect(screen.getByText("Tasks")).toBeInTheDocument();
	expect(screen.getByText("Projects")).toBeInTheDocument();
});

test("member sees no tabs (permission denied)", () => {
	renderAs("member");
	expect(screen.queryByText("Projects")).not.toBeInTheDocument();
});
