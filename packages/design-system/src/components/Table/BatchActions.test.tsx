import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

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
