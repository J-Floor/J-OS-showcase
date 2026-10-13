// @vitest-environment happy-dom
import { setDeferredImmediate } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

describe("loading", () => {
	beforeEach(() => {
		setDeferredImmediate(true);
	});
	afterEach(() => {
		setDeferredImmediate(false);
	});

	test("keeps the title, hides children, note and action, shows a status", () => {
		render(() => (
			<SpaceCard
				title="T"
				loading
				headerAction={<button>Edit</button>}
				note={<p>a-note</p>}
				actionLabel="Go"
			>
				<span>custom-body</span>
			</SpaceCard>
		));
		expect(screen.getByText("T")).toBeInTheDocument();
		expect(screen.queryByText("custom-body")).not.toBeInTheDocument();
		expect(screen.queryByText("a-note")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByRole("status")).toBeInTheDocument();
	});

	test("renders the given skeleton instead of the default", () => {
		render(() => (
			<SpaceCard
				title="T"
				loading
				skeleton={<div data-testid="mine" />}
			/>
		));
		const status = screen.getByRole("status", { name: "Loading" });
		expect(status).toContainElement(screen.getByTestId("mine"));
		expect(status).not.toHaveAttribute("data-skeleton-list");
	});

	test("paints nothing in the body until the first paint", () => {
		setDeferredImmediate(false);
		render(() => <SpaceCard title="T" loading />);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	test("shows the children once loading is false", () => {
		const [loading, setLoading] = createSignal(true);
		render(() => (
			<SpaceCard title="T" loading={loading()}>
				<span>custom-body</span>
			</SpaceCard>
		));
		expect(screen.queryByText("custom-body")).not.toBeInTheDocument();
		setLoading(false);
		expect(screen.getByText("custom-body")).toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});
