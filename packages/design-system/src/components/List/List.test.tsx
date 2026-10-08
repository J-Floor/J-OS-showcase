import { fireEvent, render, screen } from "@solidjs/testing-library";
import { vi } from "vitest";

import { List } from "./List.tsx";

test("renders item title + description", () => {
	render(() => (
		<List.Root>
			<List.Item>
				<List.ItemTitle>T</List.ItemTitle>
				<List.ItemDescription>D</List.ItemDescription>
			</List.Item>
		</List.Root>
	));
	expect(screen.getByText("T")).toBeInTheDocument();
	expect(screen.getByText("D")).toBeInTheDocument();
});

test("renders a left icon ligature", () => {
	render(() => (
		<List.Root>
			<List.Item>
				<List.ItemLeftIcon>counter_1</List.ItemLeftIcon>
				<List.ItemTitle>Item 1</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	const icon = screen.getByText("counter_1");
	expect(icon).toBeInTheDocument();
	expect(icon).toHaveAttribute("aria-hidden", "true");
});

test("Root renders a ul with each Item as a li", () => {
	const { container } = render(() => (
		<List.Root>
			<List.Item>
				<List.ItemTitle>A</List.ItemTitle>
			</List.Item>
			<List.Item>
				<List.ItemTitle>B</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	expect(container.querySelector("ul")).toBeInTheDocument();
	expect(container.querySelectorAll("li")).toHaveLength(2);
});

test("an item with onClick is one button that fires it, and the row is not a second tab stop", () => {
	const onClick = vi.fn();
	const { container } = render(() => (
		<List.Root>
			<List.Item onClick={onClick}>
				<List.ItemTitle>Inbox</List.ItemTitle>
				<List.ItemDescription>3 new messages</List.ItemDescription>
			</List.Item>
		</List.Root>
	));
	fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
	expect(onClick).toHaveBeenCalledOnce();
	const item = container.querySelector("li");
	expect(item).not.toHaveAttribute("tabindex");
	expect(item).toHaveAttribute("data-clickable");
});

test("an item without onClick stays a focusable row with no button", () => {
	const { container } = render(() => (
		<List.Root>
			<List.Item>
				<List.ItemTitle>Inbox</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	expect(screen.queryByRole("button")).toBeNull();
	expect(container.querySelector("li")).toHaveAttribute("tabindex", "0");
});

test("a wrapping description is marked so it can run over several lines", () => {
	render(() => (
		<List.Root>
			<List.Item>
				<List.ItemTitle>Inbox</List.ItemTitle>
				<List.ItemDescription wrap>A long body</List.ItemDescription>
				<List.ItemDescription>Short</List.ItemDescription>
			</List.Item>
		</List.Root>
	));
	expect(screen.getByText("A long body")).toHaveAttribute("data-wrap");
	expect(screen.getByText("Short")).not.toHaveAttribute("data-wrap");
});
