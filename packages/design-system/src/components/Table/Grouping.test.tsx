import { render, screen, fireEvent } from "@solidjs/testing-library";

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
		<Table.Root columns={columns as never} data={data} groupBy="state" />
	));
	expect(screen.getByText(/pending/i)).toBeInTheDocument();
	expect(screen.getByText(/denied/i)).toBeInTheDocument();
	expect(screen.getByText("A")).toBeInTheDocument();
	fireEvent.click(screen.getByText(/pending/i)); // collapse
	expect(screen.queryByText("A")).not.toBeInTheDocument();
});
