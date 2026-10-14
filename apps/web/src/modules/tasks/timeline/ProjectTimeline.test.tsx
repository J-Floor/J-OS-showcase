// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

afterEach(cleanup);

beforeAll(() => {
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
});

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));

import { ProjectTimeline } from "./ProjectTimeline.tsx";

function timeline(projects: never[] | undefined) {
	return render(() => (
		<ProjectTimeline
			projects={projects}
			people={[]}
			tasks={undefined}
			mode="week"
			jumpToday={() => 0}
			onSelect={() => {}}
			onCreateRange={() => {}}
		/>
	));
}

const EMPTY_COPY = "No projects with a start and end date yet.";

test("projects undefined: skeleton rows, no empty copy", () => {
	timeline(undefined);
	expect(document.querySelector("[data-skeleton-list]")).toBeInTheDocument();
	expect(screen.queryByText(EMPTY_COPY)).toBeNull();
});

test("projects empty: empty copy, no skeleton", () => {
	timeline([]);
	expect(screen.getByText(EMPTY_COPY)).toBeInTheDocument();
	expect(document.querySelector("[data-skeleton-list]")).toBeNull();
});
