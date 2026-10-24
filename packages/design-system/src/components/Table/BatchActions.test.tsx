import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { Table } from "./Table.tsx";
import { rowId } from "./testRowIds.ts";

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
	{ accessorKey: "name", header: "Name", dataType: "string" },
] as const;

type Item = { id: string; name: string };

const items: Item[] = [
	{ id: "a", name: "A" },
	{ id: "b", name: "B" },
];

/** A child of the bar reading the selection through `Table.useSelection`. */
function SelectedCount() {
	const selection = Table.useSelection<Item>();
	return <span>{`sel:${String(selection.count())}`}</span>;
}

function SelectedNames() {
	const selection = Table.useSelection<Item>();
	return (
		<span>{`sel:${selection
			.rows()
			.map((row) => row.name)
			.join(",")}`}</span>
	);
}

function rowCheckboxes(): HTMLElement[] {
	// checkbox[0] is the header select-all; the rest are per-row.
	return screen.getAllByRole("checkbox").slice(1);
}

test("plain children render while rows are selected", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={items}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<button type="button">Archive</button>
			</Table.BatchActions>
		</Table.Root>
	));
	expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
	fireEvent.click(rowCheckboxes()[0]);
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Archive" })
		).toBeInTheDocument();
	});
});

test("a child's useSelection count follows the checks", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={items}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<SelectedCount />
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(rowCheckboxes()[0]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	fireEvent.click(rowCheckboxes()[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:2")).toBeInTheDocument();
	});
});

test("useSelection's rows are the original data objects", async () => {
	let seen: Item[] = [];
	function Capture() {
		const selection = Table.useSelection<Item>();
		return (
			<button
				type="button"
				onClick={() => {
					seen = selection.rows();
				}}
			>
				Capture
			</button>
		);
	}
	render(() => (
		<Table.Root
			columns={columns as never}
			data={items}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<Capture />
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(rowCheckboxes()[1]);
	fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
	expect(seen).toEqual([items[1]]);
	expect(seen[0]).toBe(items[1]);
});

function ClearButton() {
	const selection = Table.useSelection<Item>();
	return (
		<button type="button" onClick={selection.clear}>
			Drop
		</button>
	);
}

test("useSelection's clear unchecks every row", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={items}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<ClearButton />
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(rowCheckboxes()[0]);
	fireEvent.click(rowCheckboxes()[1]);
	fireEvent.click(await screen.findByRole("button", { name: "Drop" }));
	await waitFor(() => {
		expect(
			rowCheckboxes().map((box) => (box as HTMLInputElement).checked)
		).toEqual([false, false]);
	});
});

test("useSelection outside Table.Root throws", () => {
	expect(() => render(() => <SelectedCount />)).toThrow(
		/Table\.useSelection/
	);
});

test("selection follows the row by its getRowId when a push inserts a row above it", async () => {
	const [rows, setRows] = createSignal<Item[]>(items);
	render(() => (
		<Table.Root
			columns={columns as never}
			data={rows()}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<SelectedNames />
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(rowCheckboxes()[0]);
	await waitFor(() => {
		expect(screen.getByText("sel:A")).toBeInTheDocument();
	});
	setRows([{ id: "z", name: "Z" }, ...items]);
	await waitFor(() => {
		expect(screen.getByText("sel:A")).toBeInTheDocument();
	});
});

test("the count drops when a push removes a selected row", async () => {
	const [rows, setRows] = createSignal<Item[]>(items);
	render(() => (
		<Table.Root
			columns={columns as never}
			data={rows()}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<SelectedCount />
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(rowCheckboxes()[0]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	setRows([items[1]]);
	await waitFor(() => {
		expect(screen.queryByText("sel:1")).toBeNull();
	});
});

test("a row that leaves and comes back is not selected", async () => {
	const [rows, setRows] = createSignal<Item[]>(items);
	render(() => (
		<Table.Root
			columns={columns as never}
			data={rows()}
			getRowId={rowId}
			enableRowSelection
		>
			<Table.BatchActions>
				<SelectedCount />
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(rowCheckboxes()[0]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	setRows([items[1]]);
	// The select-all box is not indeterminate over a row that is gone.
	expect(
		document
			.querySelector('thead [data-part="root"]')
			?.getAttribute("data-state")
	).toBe("unchecked");
	setRows(items);
	expect(screen.queryByText("sel:1")).toBeNull();
	expect(
		screen
			.getAllByRole("checkbox")
			.map((box) => (box as HTMLInputElement).checked)
	).toEqual([false, false, false]);
});
