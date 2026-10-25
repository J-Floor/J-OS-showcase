// @vitest-environment happy-dom
import { setDeferredImmediate } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SpaceCard } from "./SpaceCard.tsx";

afterEach(cleanup);

test("renders the title in the header and the body in its place", () => {
	render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header title="WiFi" />
			<SpaceCard.Body>
				<span>custom-body</span>
			</SpaceCard.Body>
		</SpaceCard.Root>
	));
	const title = screen.getByRole("heading", { level: 2, name: "WiFi" });
	expect(title.closest("[data-part=header]")).not.toBeNull();
	const body = screen.getByText("custom-body");
	expect(body.closest("[data-part=body]")).not.toBeNull();
	expect(body.closest("[data-part=header]")).toBeNull();
});

test("renders the subtitle under the title, inside the header", () => {
	render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header
				title="T"
				subtitle="An internet connection is required."
			/>
		</SpaceCard.Root>
	));
	const subtitle = screen.getByText("An internet connection is required.");
	expect(subtitle.closest("[data-part=header]")).toContainElement(
		screen.getByText("T")
	);
});

test("renders no subtitle when none is given", () => {
	const { container } = render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header title="T" />
		</SpaceCard.Root>
	));
	expect(container.querySelector("[data-part=description]")).toBeNull();
});

test("reaches the header action, next to the title and not in the body", () => {
	const onClick = vi.fn();
	render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header title="T">
				<SpaceCard.Action>
					<button onClick={onClick}>Edit</button>
				</SpaceCard.Action>
			</SpaceCard.Header>
			<SpaceCard.Body>body</SpaceCard.Body>
		</SpaceCard.Root>
	));
	const action = screen.getByRole("button", { name: "Edit" });
	expect(action.closest("[data-part=header]")).toContainElement(
		screen.getByText("T")
	);
	fireEvent.click(action);
	expect(onClick).toHaveBeenCalledTimes(1);
});

test("renders the help icon in the header when a Help part is given", () => {
	render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header title="T" />
			<SpaceCard.Help>Scan to join.</SpaceCard.Help>
		</SpaceCard.Root>
	));
	expect(
		screen.getByText("help").closest("[data-part=header]")
	).not.toBeNull();
});

test("renders no help icon without a Help part", () => {
	render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header title="T" />
		</SpaceCard.Root>
	));
	expect(screen.queryByText("help")).not.toBeInTheDocument();
});

test("renders the note", () => {
	render(() => (
		<SpaceCard.Root>
			<SpaceCard.Header title="T" />
			<SpaceCard.Body>body</SpaceCard.Body>
			<SpaceCard.Note>
				<p>a-note</p>
			</SpaceCard.Note>
		</SpaceCard.Root>
	));
	expect(screen.getByText("a-note")).toBeInTheDocument();
});

describe("loading", () => {
	beforeEach(() => {
		setDeferredImmediate(true);
	});
	afterEach(() => {
		setDeferredImmediate(false);
	});

	test("keeps the title and help, hides body, note and action, shows a status", () => {
		render(() => (
			<SpaceCard.Root loading>
				<SpaceCard.Header title="T">
					<SpaceCard.Action>
						<button>Edit</button>
					</SpaceCard.Action>
				</SpaceCard.Header>
				<SpaceCard.Help>help text</SpaceCard.Help>
				<SpaceCard.Body>custom-body</SpaceCard.Body>
				<SpaceCard.Note>
					<p>a-note</p>
				</SpaceCard.Note>
				<SpaceCard.Skeleton>
					<div />
				</SpaceCard.Skeleton>
			</SpaceCard.Root>
		));
		expect(screen.getByText("T")).toBeInTheDocument();
		expect(screen.getByText("help")).toBeInTheDocument();
		expect(screen.queryByText("custom-body")).not.toBeInTheDocument();
		expect(screen.queryByText("a-note")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByRole("status")).toBeInTheDocument();
	});

	test("renders the given skeleton instead of the default", () => {
		render(() => (
			<SpaceCard.Root loading>
				<SpaceCard.Header title="T" />
				<SpaceCard.Skeleton>
					<div data-testid="mine" />
				</SpaceCard.Skeleton>
			</SpaceCard.Root>
		));
		const status = screen.getByRole("status", { name: "Loading" });
		expect(status).toContainElement(screen.getByTestId("mine"));
		expect(status).not.toHaveAttribute("data-skeleton-list");
	});

	test("shows a default status without a given skeleton", () => {
		render(() => (
			<SpaceCard.Root loading>
				<SpaceCard.Header title="T" />
				<SpaceCard.Skeleton />
			</SpaceCard.Root>
		));
		expect(screen.getByRole("status")).toBeInTheDocument();
	});

	test("paints nothing in the body until the first paint", () => {
		setDeferredImmediate(false);
		render(() => (
			<SpaceCard.Root loading>
				<SpaceCard.Header title="T" />
				<SpaceCard.Skeleton />
			</SpaceCard.Root>
		));
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	test("shows the body once loading is false", () => {
		const [loading, setLoading] = createSignal(true);
		render(() => (
			<SpaceCard.Root loading={loading()}>
				<SpaceCard.Header title="T" />
				<SpaceCard.Body>custom-body</SpaceCard.Body>
				<SpaceCard.Skeleton />
			</SpaceCard.Root>
		));
		expect(screen.queryByText("custom-body")).not.toBeInTheDocument();
		setLoading(false);
		expect(screen.getByText("custom-body")).toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});
