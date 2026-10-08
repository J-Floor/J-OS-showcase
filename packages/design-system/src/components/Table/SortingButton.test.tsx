import { fireEvent, render, screen } from "@solidjs/testing-library";

import { Table } from "./Table.tsx";
import type { JfColumnDef } from "./types.ts";

// jsdom workarounds for ark/zag (Tooltip) used by header buttons.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}

type Row = { name: string; score: number };

const columns: JfColumnDef<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "score", header: () => "Points", dataType: "number" },
];

test("each sort button is named for the column it sorts", () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={[
				{ name: "B", score: 1 },
				{ name: "A", score: 2 },
			]}
		/>
	));
	expect(
		screen.getByRole("button", { name: "Sort by Name" })
	).toBeInTheDocument();
	// A header rendered by a function has no text to borrow: the id stands in.
	expect(
		screen.getByRole("button", { name: "Sort by score" })
	).toBeInTheDocument();
});

test("clicking the named button sorts that column", () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={[
				{ name: "B", score: 1 },
				{ name: "A", score: 2 },
			]}
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
	const rows = screen.getAllByRole("row");
	expect(rows[1]).toHaveTextContent("A");
});

test("a second click sorts the column descending", () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={[
				{ name: "B", score: 1 },
				{ name: "A", score: 2 },
				{ name: "C", score: 3 },
			]}
		/>
	));
	const button = screen.getByRole("button", { name: "Sort by Name" });
	fireEvent.click(button);
	fireEvent.click(button);
	const rows = screen.getAllByRole("row");
	expect(rows[1]).toHaveTextContent("C");
	expect(rows[3]).toHaveTextContent("A");
	expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
		"aria-sort",
		"descending"
	);
});

test("an empty header names the sort button by the column id", () => {
	render(() => (
		<Table.Root
			columns={[{ accessorKey: "name", header: "", dataType: "string" }]}
			data={[{ name: "B", score: 1 }]}
		/>
	));
	expect(
		screen.getByRole("button", { name: "Sort by name" })
	).toBeInTheDocument();
});
