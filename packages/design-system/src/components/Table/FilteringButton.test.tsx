import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { Table } from "./Table.tsx";

// jsdom workarounds for ark/zag (Popover/Tooltip).
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

test("text filter narrows rows", async () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={[{ name: "Alpha" }, { name: "Beta" }]}
		/>
	));
	fireEvent.click(screen.getByLabelText("Filter Name"));
	const input = await screen.findByRole("textbox");
	fireEvent.input(input, { target: { value: "Alp" } });
	await waitFor(() => {
		expect(screen.queryByText("Beta")).not.toBeInTheDocument();
	});
	expect(screen.getByText("Alpha")).toBeInTheDocument();
});
