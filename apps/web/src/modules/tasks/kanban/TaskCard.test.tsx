// @vitest-environment happy-dom
import { HOVER_INTENT_MS } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";
afterEach(cleanup);

import { TaskCard } from "./TaskCard.tsx";

const task = {
	_id: "t1",
	_creationTime: 0,
	title: "Write spec",
	status: "backlog",
	assigneeIds: ["p1"],
	projectId: "pr1",
	dueDate: Date.parse("2026-06-22"),
} as never;

test("shows title, assignee, project, due date; click fires", () => {
	const onClick = vi.fn();
	render(() => (
		<TaskCard
			task={task}
			people={[
				{ _id: "p1", firstName: "Ada", lastName: "Lovelace" } as never,
			]}
			projects={[{ _id: "pr1", name: "Launch" } as never]}
			onClick={onClick}
		/>
	));
	expect(screen.getByText("Write spec")).toBeInTheDocument();
	expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	expect(screen.getByText("Launch")).toBeInTheDocument();
	expect(screen.getByText("22 Jun 2026")).toBeInTheDocument();
	fireEvent.click(screen.getByText("Write spec"));
	expect(onClick).toHaveBeenCalled();
});

test("fires hover intent once the pointer rests on the card", () => {
	vi.useFakeTimers();
	const onHoverIntent = vi.fn();
	render(() => (
		<TaskCard
			task={task}
			people={[]}
			projects={[]}
			onClick={() => {}}
			onHoverIntent={onHoverIntent}
		/>
	));
	fireEvent.pointerEnter(screen.getByRole("article"));
	expect(onHoverIntent).not.toHaveBeenCalled();
	vi.advanceTimersByTime(HOVER_INTENT_MS);
	vi.useRealTimers();
	expect(onHoverIntent).toHaveBeenCalledTimes(1);
});
