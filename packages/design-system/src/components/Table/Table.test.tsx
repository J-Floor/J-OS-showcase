import { render, screen, waitFor, fireEvent } from "@solidjs/testing-library";
import { expect, test, vi } from "vitest";

import { setDeferredImmediate } from "../Deferred/Deferred.tsx";

import { Table } from "./Table.tsx";
import type { JfColumnDef } from "./types.ts";

// jsdom workarounds for ark/zag (Popover/Tooltip) used by header buttons.
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

type Row = { name: string; score: number };
const columns = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "score", header: "Score", dataType: "number" },
] as const;
function data(): Row[] {
	return [
		{ name: "B", score: 1 },
		{ name: "A", score: 2 },
	];
}
const loadedRows = data();

type IdRow = { id: string };
const idColumns = [
	{ accessorKey: "id", header: "ID", dataType: "string" },
] as const;

test("onDisplayedRowsChange fires with on-screen row order", async () => {
	let captured: IdRow[] = [];
	render(() => (
		<Table.Root
			columns={idColumns as never}
			data={[{ id: "a" }, { id: "b" }, { id: "c" }] as IdRow[]}
			onDisplayedRowsChange={(rows: IdRow[]) => {
				captured = rows;
			}}
		/>
	));
	await waitFor(() => {
		expect(captured.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});
});

test("onSelectedRowsChange fires with the checked rows, not written from inside BatchActions' render prop", async () => {
	// Regression for a signal write during render: a consumer used to have to
	// call its own setter from inside `Table.BatchActions`' children function,
	// which runs mid-render. This prop fires from a `createEffect` instead, the
	// same shape as `onDisplayedRowsChange` above.
	let captured: IdRow[] = [];
	render(() => (
		<Table.Root
			columns={idColumns as never}
			data={[{ id: "a" }, { id: "b" }, { id: "c" }] as IdRow[]}
			enableRowSelection
			onSelectedRowsChange={(rows: IdRow[]) => {
				captured = rows;
			}}
		/>
	));
	await waitFor(() => {
		expect(captured).toEqual([]);
	});
	// checkbox[0] is the header select-all; the rest are per-row.
	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);
	await waitFor(() => {
		expect(captured.map((r) => r.id)).toEqual(["a"]);
	});
	fireEvent.click(checkboxes[3]);
	await waitFor(() => {
		expect(captured.map((r) => r.id)).toEqual(["a", "c"]);
	});
});

test("renders rows and sorts by column", () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={data()}
			initialColumnSorting={[{ id: "score", desc: true }]}
		/>
	));
	const rows = screen.getAllByRole("row");
	// header + 2 data rows
	expect(rows.length).toBe(3);
	expect(rows[1]).toHaveTextContent("A"); // score 2 first (desc)
});

type ActionRow = { name: string; group: string };
const actionColumns: JfColumnDef<ActionRow>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "group", header: "Group", dataType: "string" },
	{
		id: "actions",
		header: "",
		dataType: "string",
		size: 84,
		enableSorting: false,
		cell: () => <button type="button">act</button>,
	},
];

/** Cells per row, header and body, so the two can be compared. */
function cellCounts(): { head: number; body: number } {
	const table = document.querySelector("table");
	const head = table?.querySelector("thead tr")?.children.length ?? 0;
	const body = Array.from(table?.querySelectorAll("tbody tr") ?? [])
		.map((tr) => tr.children.length)
		.find((n) => n > 1);
	return { head, body: body ?? 0 };
}

/** `<col>` elements, which is what `table-layout: fixed` sizes against. */
function colCount(): number {
	return document.querySelectorAll("table colgroup col").length;
}

test("the header has a cell for every column the body and colgroup have", () => {
	// The colgroup injects a flexible spacer column before the sticky actions
	// column, and `leafColCount` counts it — but the header did not render one.
	// The header row came out a cell short, so every heading sat one column
	// left of what it labelled and the actions column had no header at all,
	// which read as the row's buttons hanging off the end of the table.
	render(() => (
		<Table.Root
			columns={actionColumns}
			data={[{ name: "A", group: "G" }]}
			groupBy="group"
		/>
	));
	const { head, body } = cellCounts();
	expect(head).toBe(body);
	// And both agree with the colgroup, which is what `table-layout: fixed`
	// actually sizes against.
	expect(head).toBe(colCount());
});

test("the plain table has no spacer, since it has no colgroup either", () => {
	// The spacer belongs to the grouped table: only that one renders a colgroup
	// for `table-layout: fixed` to size against. Adding the cell here too would
	// invent a column nothing sizes.
	render(() => (
		<Table.Root
			columns={actionColumns}
			data={[{ name: "A", group: "G" }]}
		/>
	));
	const { head, body } = cellCounts();
	expect(head).toBe(body);
	expect(colCount()).toBe(0);
	// Name, Group, actions — and nothing else.
	expect(head).toBe(actionColumns.length);
});

test("ungrouped skeleton has one cell per header cell, even with an actions column", () => {
	// The grouped table's actions column gets a spacer cell (see the two
	// tests above); the ungrouped one does not. `skeletonCols` must match
	// whichever branch it renders in, or the skeleton row comes out one `td`
	// wider than the header it sits under.
	render(() => <Table.Root columns={actionColumns} data={undefined} />);
	const headCells = document.querySelectorAll("thead tr th").length;
	const skeletonCells = document
		.querySelector("[data-skeleton-row]")
		?.querySelectorAll("td").length;
	expect(skeletonCells).toBe(headCells);
});

// The blank-table-after-tab-switch recovery is exercised end-to-end in
// Virtualize.test.tsx: the reactive `scrollParentHeight` signal drives
// `virtualizing()` both ways across a hide/show cycle, so any zero-height
// measurements taken while the tab panel was hidden are re-taken against
// real rows on return — no `needsRemeasure` heuristic needed.

test("undefined data renders skeleton rows, not 'No results.'", () => {
	render(() => <Table.Root columns={columns as never} data={undefined} />);
	expect(screen.queryByText("No results.")).toBeNull();
	expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(8);
});

test("loading renders one skeleton cell per visible column", () => {
	render(() => <Table.Root columns={columns as never} data={[]} loading />);
	const row = document.querySelector("[data-skeleton-row]");
	expect(row?.querySelectorAll("td").length).toBe(columns.length);
});

test("the header renders while loading", () => {
	render(() => <Table.Root columns={columns as never} data={undefined} />);
	expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
});

test("first mount shows skeleton rows until the paint, then real rows", async () => {
	setDeferredImmediate(false);
	vi.useFakeTimers();
	try {
		render(() => (
			<Table.Root columns={columns as never} data={loadedRows} />
		));
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(8);
		await vi.runAllTimersAsync();
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
	} finally {
		vi.useRealTimers();
		setDeferredImmediate(true);
	}
});
