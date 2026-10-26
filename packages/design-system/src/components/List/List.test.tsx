import { fireEvent, render, screen } from "@solidjs/testing-library";
import { vi } from "vitest";

import {
	MORPH_LIST_ROW,
	MORPH_OF,
	MORPH_TITLE,
} from "../../utils/morphNames.ts";
import { Icon } from "../Icon/Icon.tsx";

import { List } from "./List.tsx";

test("morphId makes the row an entity surface and the title marks itself", () => {
	render(() => (
		<List.Item morphId="p1" data-testid="row">
			<List.ItemTitle>Roof</List.ItemTitle>
		</List.Item>
	));
	expect(screen.getByTestId("row")).toHaveAttribute(MORPH_OF, "p1");
	expect(screen.getByText("Roof")).toHaveAttribute(MORPH_TITLE);
});

test("a row without morphId carries no entity attribute and its title no marker", () => {
	render(() => (
		<List.Item data-testid="row">
			<List.ItemTitle>Roof</List.ItemTitle>
		</List.Item>
	));
	expect(screen.getByTestId("row")).not.toHaveAttribute(MORPH_OF);
	expect(screen.getByText("Roof")).not.toHaveAttribute(MORPH_TITLE);
});

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

test("Root is a list of list items without ul/li markup", () => {
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
	expect(screen.getByRole("list")).toBeInTheDocument();
	expect(screen.getAllByRole("listitem")).toHaveLength(2);
	expect(container.querySelector("ul, li")).toBeNull();
});

test("rows under a Root given another role claim no list item role", () => {
	render(() => (
		<List.Root role="presentation">
			<List.Item>
				<List.ItemTitle>A</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	expect(screen.queryByRole("list")).toBeNull();
	expect(screen.queryByRole("listitem")).toBeNull();
});

test("Root forwards its attributes", () => {
	render(() => (
		<List.Root aria-label="Inbox" id="inbox">
			<List.Item>
				<List.ItemTitle>A</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	expect(screen.getByRole("list", { name: "Inbox" })).toHaveAttribute(
		"id",
		"inbox"
	);
});

test("an item with onClick is one button that fires it, and the row is not a second tab stop", () => {
	const onClick = vi.fn();
	render(() => (
		<List.Root>
			<List.Item onClick={onClick}>
				<List.ItemTitle>Inbox</List.ItemTitle>
				<List.ItemDescription>3 new messages</List.ItemDescription>
			</List.Item>
		</List.Root>
	));
	fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
	expect(onClick).toHaveBeenCalledOnce();
	const item = screen.getByRole("listitem");
	expect(item).not.toHaveAttribute("tabindex");
	expect(item).toHaveAttribute("data-clickable");
});

test("an inert row is no tab stop and has no button", () => {
	render(() => (
		<List.Root>
			<List.Item>
				<List.ItemTitle>Inbox</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.getByRole("listitem")).not.toHaveAttribute("tabindex");
});

test("content written before the text leads the row, content after it trails", () => {
	render(() => (
		<List.Root>
			<List.Item>
				<Icon>star</Icon>
				<List.ItemTitle>Ada</List.ItemTitle>
				<Icon>chevron_right</Icon>
			</List.Item>
		</List.Root>
	));
	const row = screen.getByRole("listitem");
	const slots = Array.from(row.children).map((slot) => slot.textContent);
	expect(slots).toEqual(["star", "Ada", "chevron_right"]);
});

test("a title takes rich children", () => {
	render(() => (
		<List.Root>
			<List.Item>
				<List.ItemTitle>
					<strong>Bold</strong> name
				</List.ItemTitle>
			</List.Item>
		</List.Root>
	));
	expect(screen.getByText("Bold").tagName).toBe("STRONG");
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

test("every row carries the list row marker, inside a list or not, clickable or not", () => {
	render(() => (
		<>
			<List.Root>
				<List.Item data-testid="plain">
					<List.ItemTitle>A</List.ItemTitle>
				</List.Item>
				<List.Item data-testid="clickable" onClick={() => {}}>
					<List.ItemTitle>B</List.ItemTitle>
				</List.Item>
			</List.Root>
			<List.Item data-testid="loose">
				<List.ItemTitle>C</List.ItemTitle>
			</List.Item>
			<List.Item data-testid="loose-clickable" onClick={() => {}}>
				<List.ItemTitle>D</List.ItemTitle>
			</List.Item>
		</>
	));
	for (const id of ["plain", "clickable", "loose", "loose-clickable"])
		expect(screen.getByTestId(id)).toHaveAttribute(MORPH_LIST_ROW);
});
