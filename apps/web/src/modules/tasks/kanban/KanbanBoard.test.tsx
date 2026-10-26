// @vitest-environment happy-dom
import { OWN_GESTURES_ATTR } from "@j-os/design-system";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
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
		(element) => element.textContent.trim() === "0"
	);
	expect(zeros).toHaveLength(3);
});

test("the board handles its own drags (cards, marquee), so a tab swipe never starts on it", () => {
	const { container } = board([]);
	expect(
		container.querySelector('[data-part="kanban-board"]')
	).toHaveAttribute(OWN_GESTURES_ATTR);
});
