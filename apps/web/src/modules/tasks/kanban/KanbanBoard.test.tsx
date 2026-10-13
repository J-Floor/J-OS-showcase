// @vitest-environment happy-dom
import { cleanup, render } from "@solidjs/testing-library";
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
	useQuery: () => ({ data: () => undefined }),
}));

import { KanbanBoard } from "./KanbanBoard.tsx";

function board(tasks: never[] | undefined) {
	return render(() => (
		<KanbanBoard
			tasks={tasks}
			people={[]}
			projects={[]}
			onCardClick={() => {}}
			onAddTask={() => {}}
		/>
	));
}

test("tasks undefined: each column shows a skeleton list and a skeleton count, no zeros", () => {
	const { container } = board(undefined);
	expect(container.querySelectorAll("[data-skeleton-list]")).toHaveLength(3);
	const counts = [...container.querySelectorAll("[data-column-count]")];
	expect(counts).toHaveLength(3);
	for (const count of counts) {
		expect(count.querySelector("[data-width]")).not.toBeNull();
		expect(count.textContent.trim()).toBe("");
	}
});

test("tasks empty: counts read 0 and no skeletons", () => {
	const { container } = board([]);
	expect(container.querySelectorAll("[data-skeleton-list]")).toHaveLength(0);
	const zeros = [...container.querySelectorAll("header span")].filter(
		(s) => s.textContent.trim() === "0"
	);
	expect(zeros).toHaveLength(3);
});
