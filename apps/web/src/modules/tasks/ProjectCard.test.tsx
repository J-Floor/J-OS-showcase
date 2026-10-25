// @vitest-environment happy-dom
import { HOVER_INTENT_MS } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import { entityIn } from "../../../test-stubs/morphKeys.tsx";

import { ProjectCard } from "./ProjectCard.tsx";

const id = "p1" as Id<"projects">;

afterEach(cleanup);

test("shows a skeleton for the task count while it loads", () => {
	const { container } = render(() => (
		<ProjectCard
			id={id}
			name="Roof"
			taskCount={undefined}
			onClick={() => {}}
		/>
	));
	expect(container.querySelector("[data-width]")).not.toBeNull();
	expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
});

test("shows the task count once known", () => {
	const { container } = render(() => (
		<ProjectCard id={id} name="Roof" taskCount={0} onClick={() => {}} />
	));
	expect(container.querySelector("[data-width]")).toBeNull();
	expect(screen.getByText(/0/)).toBeInTheDocument();
});

test("a boxed card draws its box on the element that morphs, so the box goes with it", () => {
	const { container } = render(() => (
		<ProjectCard
			isBoxed
			id={id}
			name="Roof"
			taskCount={0}
			onClick={() => {}}
		/>
	));
	const box = container.querySelector("[data-boxed]");
	expect(box).not.toBeNull();
	expect(box).toBe(entityIn(container));
});

test("fires hover intent once the pointer rests on the card", () => {
	vi.useFakeTimers();
	const onHoverIntent = vi.fn();
	render(() => (
		<ProjectCard
			id={id}
			name="Roof"
			taskCount={0}
			onClick={() => {}}
			onHoverIntent={onHoverIntent}
		/>
	));
	fireEvent.pointerEnter(screen.getByRole("button", { name: /Roof/ }));
	expect(onHoverIntent).not.toHaveBeenCalled();
	vi.advanceTimersByTime(HOVER_INTENT_MS);
	vi.useRealTimers();
	expect(onHoverIntent).toHaveBeenCalledTimes(1);
});
