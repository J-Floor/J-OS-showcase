// @vitest-environment happy-dom
import { HOVER_INTENT_MS, Tabs } from "@j-os/design-system";
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
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
	ProjectTimeline: (props: { onHoverIntent: () => void }) => (
		<button
			type="button"
			onClick={() => {
				props.onHoverIntent();
			}}
		>
			rest on a bar
		</button>
	),
}));
vi.mock("../sheets/ProjectSheet.tsx", () => ({
	ProjectSheet: (props: { open: boolean; prebuild?: boolean }) => (
		<div
			data-testid="project-sheet"
			data-open={String(props.open)}
			data-prebuild={String(props.prebuild)}
		/>
	),
}));
vi.mock("../sheets/TaskSheet.tsx", () => ({ TaskSheet: () => null }));

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
					<Tabs.Root value="projects">
						<Tabs.Bar />
						<ProjectsTab active={() => true} onNeedTab={() => {}} />
					</Tabs.Root>
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

test("its New project and Today actions sit in the tab bar; New project opens the create sheet", () => {
	const { container } = renderTab();
	const bar = container.querySelector('[data-part="tab-actions"]');
	const create = screen.getByRole("button", { name: /New project/ });
	expect(bar).toContainElement(create);
	expect(bar).toContainElement(screen.getByRole("button", { name: /Today/ }));
	fireEvent.click(create);
	expect(screen.getByTestId("project-sheet")).toHaveAttribute(
		"data-open",
		"true"
	);
});

test("lists undated projects once loaded", () => {
	projectRows.current = [{ _id: "p1", name: "Roof" }];
	renderTab();
	expect(screen.getByText("No dates set")).toBeInTheDocument();
	expect(screen.getByText("Roof")).toBeInTheDocument();
});

test("resting on a timeline project builds the sheet before it opens", () => {
	renderTab();
	const sheet = screen.getByTestId("project-sheet");
	expect(sheet).toHaveAttribute("data-prebuild", "false");
	fireEvent.click(screen.getByRole("button", { name: "rest on a bar" }));
	expect(sheet).toHaveAttribute("data-prebuild", "true");
	expect(sheet).toHaveAttribute("data-open", "false");
});

test("resting on an undated project builds the sheet before it opens", () => {
	vi.useFakeTimers();
	projectRows.current = [{ _id: "p1", name: "Roof" }];
	renderTab();
	const sheet = screen.getByTestId("project-sheet");
	fireEvent.pointerEnter(screen.getByRole("button", { name: /Roof/ }));
	vi.advanceTimersByTime(HOVER_INTENT_MS);
	vi.useRealTimers();
	expect(sheet).toHaveAttribute("data-prebuild", "true");
	expect(sheet).toHaveAttribute("data-open", "false");
});
