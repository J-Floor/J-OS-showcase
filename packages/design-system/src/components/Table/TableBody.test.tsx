import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { Table } from "./Table.tsx";
import { rowId } from "./testRowIds.ts";
import type { JfColumnDefinition } from "./types.ts";

type Row = { id: string; name: string; group: "a" | "b" };

const columns: JfColumnDefinition<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{
		accessorKey: "group",
		header: "Group",
		dataType: "enum",
		enumOptions: [
			{ value: "a", label: "A" },
			{ value: "b", label: "B" },
		],
	},
];

function rows(name = "Ada"): Row[] {
	return [
		{ id: "1", name, group: "a" },
		{ id: "2", name: "Grace", group: "b" },
	];
}

function dataRows(container: HTMLElement): HTMLTableRowElement[] {
	return [
		...container.querySelectorAll<HTMLTableRowElement>("tbody tr"),
	].filter((row) => row.hasAttribute("data-morph-of"));
}

test.each([
	["flat", undefined],
	["grouped", "group" as const],
])(
	"a %s body keeps its rows across a data refresh and updates cells in place",
	(_label, groupBy) => {
		const [data, setData] = createSignal(rows());
		const { container } = render(() => (
			<Table.Root
				getRowId={rowId}
				columns={columns}
				data={data()}
				groupBy={groupBy}
			/>
		));
		const before = dataRows(container);
		const cellBefore = before[0].querySelector("td");
		expect(before).toHaveLength(2);
		expect(before[0]).toHaveTextContent("Ada");

		setData(rows("Ada Lovelace"));

		const after = dataRows(container);
		expect(after).toHaveLength(2);
		expect(after[0]).toBe(before[0]);
		expect(after[1]).toBe(before[1]);
		expect(after[0].querySelector("td")).toBe(cellBefore);
		expect(after[0]).toHaveTextContent("Ada Lovelace");
	}
);

test("a reorder moves each row's node with its text", () => {
	const [data, setData] = createSignal(rows());
	const { container } = render(() => (
		<Table.Root getRowId={rowId} columns={columns} data={data()} />
	));
	const [ada, grace] = dataRows(container);

	setData(rows("Ada B").reverse());

	const after = dataRows(container);
	expect(after[0]).toBe(grace);
	expect(after[1]).toBe(ada);
	expect(grace).toHaveTextContent("Grace");
	expect(ada).toHaveTextContent("Ada B");
});

test("a removed row leaves the others in place", () => {
	const [data, setData] = createSignal(rows());
	const { container } = render(() => (
		<Table.Root getRowId={rowId} columns={columns} data={data()} />
	));
	const [ada, grace] = dataRows(container);

	setData(rows().slice(1));

	const after = dataRows(container);
	expect(after).toEqual([grace]);
	expect(ada.isConnected).toBe(false);
	expect(grace).toHaveTextContent("Grace");
});

test("a refresh keeps the node a cell renders and updates its value", () => {
	const valued: JfColumnDefinition<Row>[] = [
		{
			accessorKey: "name",
			header: "Name",
			dataType: "string",
			cell: (context) => (
				<input aria-label="Name" value={String(context.getValue())} />
			),
		},
	];
	const [data, setData] = createSignal(rows());
	const { container } = render(() => (
		<Table.Root getRowId={rowId} columns={valued} data={data()} />
	));
	const input = dataRows(container)[0].querySelector("input");
	input?.focus();

	setData(rows("Ada Lovelace"));

	const after = dataRows(container)[0].querySelector("input");
	expect(after).toBe(input);
	expect(after).toHaveValue("Ada Lovelace");
	expect(document.activeElement).toBe(input);
});
