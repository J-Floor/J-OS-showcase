import { render, screen, fireEvent } from "@solidjs/testing-library";

import { Table } from "./Table.tsx";
import { rowIndex } from "./testRowIds.ts";

if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const columns = [
	{ accessorKey: "state", header: "State", dataType: "string" },
	{ accessorKey: "name", header: "Name", dataType: "string" },
] as const;
const data = [
	{ state: "pending", name: "A" },
	{ state: "denied", name: "B" },
	{ state: "pending", name: "C" },
];

test("renders a group header row per group; collapses on click", () => {
	render(() => (
		<Table.Root
			getRowId={rowIndex}
			columns={columns as never}
			data={data}
			groupBy="state"
		/>
	));
	expect(screen.getByText(/pending/i)).toBeInTheDocument();
	expect(screen.getByText(/denied/i)).toBeInTheDocument();
	expect(screen.getByText("A")).toBeInTheDocument();
	fireEvent.click(screen.getByText(/pending/i)); // collapse
	expect(screen.queryByText("A")).not.toBeInTheDocument();
});

test("a column's groupLabel names groups keyed by another value", () => {
	const rows = [
		{ id: "1", ownerId: "a", ownerName: "Alex Example" },
		{ id: "2", ownerId: "b", ownerName: "Alex Example" },
		{ id: "3", ownerId: "a", ownerName: "Alex Example" },
	];
	const ownerColumns = [
		{
			id: "owner",
			header: "Owner",
			dataType: "string",
			accessorFn: (row: (typeof rows)[number]) => row.ownerId,
			groupLabel: (row: (typeof rows)[number]) => row.ownerName,
		},
		{ accessorKey: "id", header: "Id", dataType: "string" },
	];
	render(() => (
		<Table.Root
			getRowId={(row) => row.id}
			columns={ownerColumns as never}
			data={rows}
			groupBy="owner"
		/>
	));
	const headers = screen
		.getAllByText(/Alex Example/)
		.map((element) => element.textContent.replaceAll(/\s+/g, " ").trim());
	expect(headers).toEqual(["Alex Example (2)", "Alex Example (1)"]);
});
