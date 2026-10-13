// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { projectRows } = vi.hoisted(() => ({
	projectRows: { current: undefined as unknown[] | undefined },
}));

vi.mock("../data/tasksData.tsx", () => ({
	useProjects: () => ({ data: () => projectRows.current }),
	useTasks: () => ({ data: () => [] }),
}));
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));
vi.mock("../timeline/ProjectTimeline.tsx", () => ({
	ProjectTimeline: () => null,
}));
vi.mock("../drawers/ProjectDrawer.tsx", () => ({ ProjectDrawer: () => null }));
vi.mock("../drawers/TaskDrawer.tsx", () => ({ TaskDrawer: () => null }));

import { ProjectsTab } from "./ProjectsTab.tsx";

afterEach(() => {
	cleanup();
	projectRows.current = undefined;
});

function renderTab() {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<ProjectsTab
						requestNew={() => 0}
						mode={() => "month"}
						jumpToday={() => 0}
						active={() => true}
						onNeedTab={() => undefined}
					/>
				)}
			/>
		</MemoryRouter>
	));
}

test("while projects load, the undated section renders nothing (the timeline shows the skeleton)", () => {
	const { container } = renderTab();
	expect(screen.queryByText("No dates set")).not.toBeInTheDocument();
	expect(container.querySelector("[data-skeleton-list]")).toBeNull();
});

test("lists undated projects once loaded", () => {
	projectRows.current = [{ _id: "p1", name: "Roof" }];
	renderTab();
	expect(screen.getByText("No dates set")).toBeInTheDocument();
	expect(screen.getByText("Roof")).toBeInTheDocument();
});
