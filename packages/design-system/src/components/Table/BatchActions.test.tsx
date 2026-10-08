import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { Table } from "./Table.tsx";

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

test("selecting a row shows the batch bar with count", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={[{ name: "A" }, { name: "B" }]}
			enableRowSelection
		>
			<Table.BatchActions>
				{(p) => <span>{`sel:${String(p.selectedCount)}`}</span>}
			</Table.BatchActions>
		</Table.Root>
	));
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]); // first data row (checks[0] is select-all)
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
});

test("the render-prop count stays reactive across multiple selections", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={[{ name: "A" }, { name: "B" }]}
			enableRowSelection
		>
			<Table.BatchActions>
				{(p) => <span>{`sel:${String(p.selectedCount)}`}</span>}
			</Table.BatchActions>
		</Table.Root>
	));
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	fireEvent.click(checks[2]); // second data row
	await waitFor(() => {
		expect(screen.getByText("sel:2")).toBeInTheDocument();
	});
});

type Doc = { _id: string; name: string };

test("selection follows the row by _id when a push inserts a row above it", async () => {
	const docs: Doc[] = [
		{ _id: "a", name: "A" },
		{ _id: "b", name: "B" },
	];
	const [rows, setRows] = createSignal<Doc[]>(docs);
	render(() => (
		<Table.Root columns={columns as never} data={rows()} enableRowSelection>
			<Table.BatchActions>
				{(p) => (
					<span>{`sel:${p.selectedRows.map((r) => r.name).join(",")}`}</span>
				)}
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:A")).toBeInTheDocument();
	});
	setRows([{ _id: "z", name: "Z" }, ...docs]);
	await waitFor(() => {
		expect(screen.getByText("sel:A")).toBeInTheDocument();
	});
});

test("the count drops when a push removes a selected row", async () => {
	const [rows, setRows] = createSignal<Doc[]>([
		{ _id: "a", name: "A" },
		{ _id: "b", name: "B" },
	]);
	render(() => (
		<Table.Root columns={columns as never} data={rows()} enableRowSelection>
			<Table.BatchActions>
				{(p) => <span>{`sel:${String(p.selectedCount)}`}</span>}
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	setRows([{ _id: "b", name: "B" }]);
	await waitFor(() => {
		expect(screen.queryByText("sel:1")).toBeNull();
	});
});

test("a getRowId keys selection for data with no _id", async () => {
	const named = [{ name: "A" }, { name: "B" }];
	const [rows, setRows] = createSignal(named);
	render(() => (
		<Table.Root
			columns={columns as never}
			data={rows()}
			enableRowSelection
			getRowId={(row) => row.name}
		>
			<Table.BatchActions>
				{(p) => (
					<span>{`sel:${p.selectedRows.map((r) => r.name).join(",")}`}</span>
				)}
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:A")).toBeInTheDocument();
	});
	setRows([{ name: "Z" }, ...named]);
	await waitFor(() => {
		expect(screen.getByText("sel:A")).toBeInTheDocument();
	});
});

test("a row that leaves and comes back is not selected", async () => {
	const docs: Doc[] = [
		{ _id: "a", name: "A" },
		{ _id: "b", name: "B" },
	];
	const [rows, setRows] = createSignal<Doc[]>(docs);
	render(() => (
		<Table.Root columns={columns as never} data={rows()} enableRowSelection>
			<Table.BatchActions>
				{(p) => <span>{`sel:${String(p.selectedCount)}`}</span>}
			</Table.BatchActions>
		</Table.Root>
	));
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	setRows([docs[1]]);
	// The select-all box is not indeterminate over a row that is gone.
	expect(
		document
			.querySelector('thead [data-part="root"]')
			?.getAttribute("data-state")
	).toBe("unchecked");
	setRows(docs);
	expect(screen.queryByText("sel:1")).toBeNull();
	expect(
		screen
			.getAllByRole("checkbox")
			.map((box) => (box as HTMLInputElement).checked)
	).toEqual([false, false, false]);
});
