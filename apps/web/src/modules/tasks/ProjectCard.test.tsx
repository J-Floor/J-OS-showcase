// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { ProjectCard } from "./ProjectCard.tsx";

afterEach(cleanup);

test("shows a skeleton for the task count while it loads", () => {
	const { container } = render(() => (
		<ProjectCard name="Roof" taskCount={undefined} onClick={() => {}} />
	));
	expect(container.querySelector("[data-width]")).not.toBeNull();
	expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
});

test("shows the task count once known", () => {
	const { container } = render(() => (
		<ProjectCard name="Roof" taskCount={0} onClick={() => {}} />
	));
	expect(container.querySelector("[data-width]")).toBeNull();
	expect(screen.getByText(/0/)).toBeInTheDocument();
});
