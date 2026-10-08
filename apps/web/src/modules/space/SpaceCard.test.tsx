// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { SpaceCard } from "./SpaceCard.tsx";

afterEach(cleanup);

test("renders title and a default body icon", () => {
	render(() => <SpaceCard title="WiFi" helpText="help" icon="wifi" />);
	expect(screen.getByText("WiFi")).toBeInTheDocument();
	expect(screen.getByText("wifi")).toBeInTheDocument(); // Icon ligature
});

test("renders an action button that fires onAction", () => {
	const onAction = vi.fn();
	render(() => (
		<SpaceCard
			title="T"
			helpText="h"
			actionLabel="Go"
			onAction={onAction}
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: "Go" }));
	expect(onAction).toHaveBeenCalledTimes(1);
});

test("omits the button when no actionLabel", () => {
	render(() => <SpaceCard title="T" helpText="h" icon="lock" />);
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("renders custom children instead of the icon", () => {
	render(() => (
		<SpaceCard title="T" helpText="h" icon="wifi">
			<span>custom-body</span>
		</SpaceCard>
	));
	expect(screen.getByText("custom-body")).toBeInTheDocument();
	expect(screen.queryByText("wifi")).not.toBeInTheDocument();
});

test("renders a help trigger when helpText is given", () => {
	render(() => <SpaceCard title="T" helpText="h" icon="lock" />);
	expect(screen.getByText("help")).toBeInTheDocument(); // Icon ligature
});

test("renders no help trigger without helpText", () => {
	render(() => <SpaceCard title="T" icon="lock" />);
	expect(screen.getByText("T")).toBeInTheDocument();
	expect(screen.queryByText("help")).not.toBeInTheDocument();
});

test("renders the subtitle under the title when given", () => {
	render(() => (
		<SpaceCard title="T" subtitle="An internet connection is required." />
	));
	const subtitle = screen.getByText("An internet connection is required.");
	// Inside the header block, not the body.
	expect(subtitle.closest("header")).toContainElement(screen.getByText("T"));
});

test("renders no subtitle when none is given", () => {
	const { container } = render(() => <SpaceCard title="T" helpText="h" />);
	expect(container.querySelector("header p")).toBeNull();
});

test("renders a header action next to the title when given", () => {
	render(() => (
		<SpaceCard
			title="T"
			helpText="h"
			headerAction={<button>Edit</button>}
		/>
	));
	const action = screen.getByRole("button", { name: /^Edit/ });
	// In the header block, not the body.
	expect(action.closest("header")).toContainElement(screen.getByText("T"));
});
